
// Synthetic Events

const nativeToSyntheticEvent = (event, name) => {
    const eventKey = `__${name}`
    let dom = event.target
    while(dom !== null) {
        const eventHandler = dom[eventKey]
        if (eventHandler) {
            eventHandler(dom[`__${name}Data`])
            return
        }
        dom = dom.parentNode
    }
}
const CONFIGURED_SYNTHETIC_EVENTS = {}
function setupSyntheticEvent(name) {
    if (CONFIGURED_SYNTHETIC_EVENTS[name]) return
    document.addEventListener(name, event => nativeToSyntheticEvent(event, name))
    CONFIGURED_SYNTHETIC_EVENTS[name] = true
}

// Core
//
// To speed up template compiler:
// - Reduce amount of fn calls, because every call has cost of allocating memory for new fn context.
//   Inline as much code as possible ot avoid calls.
// - Preallocate all variables at once in module context instead of fn arguments.
//   It reduces time to allocate context memory for functions that needed some arguments for every call.
//   Use Stack for handling arguments of nested/recursive calls.
// - String concatenation is faster than arr.join('')
// - arr[idx] is faster than arr.push, because it's not a function call,
//   therefore it doesn't need to allocate memory for new fn context
// - str[idx] and str.slice are faster than regex matching
//

let tagCounter = 0

let root, node, staticCode,
tagName, tag, tagId, createElement, parent,
attr, aname, avalue, eventType, 
reactiveValue, handlerTokens,
vdomCode, compareCode, args, 
vdomId, arg, appendCode, refsCode, 
nodeData, eventHandler, parenIdx,
eventHandlerArgs

let stack = [], stackIdx = 0
function codegen(node, parent, root) {
    tagName = node.tagName
    if (tagName !== undefined) {
        tag = tagName.toLowerCase()
        tagId = tag + (++tagCounter)
        createElement = 'createElement'
    } else {
        if (node.data.trim() === '') return
        tag = ''
        tagId = 'text' + (++tagCounter)
        createElement = 'createTextNode'
    }
    staticCode += `const ${tagId} = document.${createElement}("${tag}");\n`
    
    if (root === undefined) root = tagId
    
    if (tagName !== undefined) {

        // codegenAttributes
        if (node.attributes !== undefined) {
            for(attr of node.attributes) {
                aname = attr.name
                avalue = attr.value

                if (aname === 'class') aname = 'className'

                if (aname[0] === 'o' && aname[1] === 'n') {

                    eventType = aname.slice(2)
                    setupSyntheticEvent(eventType)

                    if (avalue.indexOf("${") >= 0) {
                        reactiveValue = avalue.slice(2, avalue.length - 1)
                        parenIdx = reactiveValue.indexOf("(")
                        eventHandler = reactiveValue.slice(0, parenIdx)
                        eventHandlerArgs = reactiveValue.slice(parenIdx + 1, reactiveValue.length - 1).split(',')

                        staticCode += `${tagId}.__${eventType} = scope.${eventHandler};\n`

                        refsCode += `${root}.__${tagId} = ${tagId};\n`

                        vdomId = makeid.possible.charAt(makeid.counter++)
                        vdomCode += `vdom.${vdomId} = ${eventHandlerArgs};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.__${eventType}Data = vdom.${vdomId};\n`
                    } else {
                        staticCode += `${tagId}.on${eventType} = ${avalue};\n`
                    }

                } else if (avalue.indexOf("${") >= 0) {
                    if (aname === 'className') {
                        refsCode += `${root}.__${tagId} = ${tagId};\n`

                        vdomId = makeid.possible.charAt(makeid.counter++)
                        vdomCode += `vdom.${vdomId} = ${avalue.slice(2, avalue.length - 1)};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.className = vdom.${vdomId};\n`
                    } else {
                        refsCode += `${root}.__${tagId} = ${tagId};\n`

                        vdomId = makeid.possible.charAt(makeid.counter++)
                        vdomCode += `vdom.${vdomId} = ${avalue.slice(2, avalue.length - 1)};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.setAttribute("${aname}", vdom.${vdomId});\n`
                    }
                } else {
                    if (aname === 'className') {
                        staticCode += `${tagId}.${aname} = "${avalue}";\n`
                    } else {
                        staticCode += `${tagId}.setAttribute("${aname}", "${avalue}");\n`
                    }
                }     
            }
        }
        // End codegenAttributes

    } else {

        // codegenText
        nodeData = node.data
        if (nodeData.indexOf("${") >= 0) {
            refsCode += `${root}.__${tagId} = ${tagId};\n`

            vdomId = makeid.possible.charAt(makeid.counter++)
            vdomCode += `vdom.${vdomId} = ${nodeData.slice(2, nodeData.length - 1)};\n`
            compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.data = vdom.${vdomId};\n`
        } else {
            staticCode += `${node}.data = "${nodeData}"`
        }
        // End codegenText

    }

    if (parent === root) {
        staticCode += appendCode
        appendCode = ''
    }
    if (parent !== undefined) {
        appendCode = `${parent}.appendChild(${tagId});\n` + appendCode
    }
    return tagId
}

// Inspired by: https://gist.github.com/cowboy/958000
function walker(node) {
    let skip = false, tmp, lastNode
    lastNode = root = codegen(node)
    do {
        if (!skip && (tmp = node.firstChild)) {
            skip = false
            stack[stackIdx++] = parent
            parent = lastNode
            lastNode = codegen(tmp, parent, root)
        } else if (tmp = node.nextSibling) {
            skip = false
            lastNode = codegen(tmp, parent, root)
        } else {
            tmp = node.parentNode
            parent = stack[--stackIdx]
            skip = true
        }
        node = tmp
    } while (node)
    staticCode += appendCode + refsCode + `return ${root};`
}

function makeid() {}
makeid.possible = "abcdefghijklmnopqrstuvwxyz"
makeid.counter = 0

let templateInstance
class Template {
    constructor(dom) {
        staticCode = vdomCode = compareCode = appendCode = refsCode = ''
        walker(dom)
        this.create = Function("scope", staticCode)
        this.update = Function("{" + args + "}", "node = this", "current = node.__vdom || {}", 'const vdom = {};\n' + vdomCode + compareCode + "node.__vdom = vdom;")
    }
    createInstance(scope) {
        templateInstance = this.create(scope)
        templateInstance.update = this.update
        templateInstance.update(scope)
        return templateInstance
    }
}

function domc(dom, scope) {
    args = ''
    for(arg of Object.keys(scope)) args += arg + ","
    return new Template(dom)
}

export default domc
