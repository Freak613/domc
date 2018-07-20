
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
//
// TODO:
// - Rewrite recursive codegen into iterative one.
//   DOM TreeWalker is not applicable here because it doesn't provide information about tree depth of current node.
//   AppendChild of node must happen as last operation after all attributes has been set and all children attached.

const EVENT_HANDLER_REGEX = new RegExp(/^on/)

let tagCounter = 0

let root, node, staticCode,
tagName, tag, tagId, createElement, parent,
attr, aname, avalue, eventType, 
reactiveValue, handlerTokens,
vdomCode, compareCode, args, 
vdomId, arg

let stack = [], stackIdx = 0
function codegen() {
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

                if (EVENT_HANDLER_REGEX.test(aname)) {

                    eventType = aname.replace(EVENT_HANDLER_REGEX, '')
                    setupSyntheticEvent(eventType)

                    if (avalue.indexOf("${") >= 0) {
                        reactiveValue = avalue.match(/^\$\{(.*)\}$/)[1]
                        handlerTokens = reactiveValue.split(/[\(\)]/)

                        staticCode += `${tagId}.__${eventType} = scope.${handlerTokens[0]};\n`

                        staticCode += `${root}.__${tagId} = ${tagId};\n`

                        vdomId = makeid.possible.charAt(makeid.counter++)
                        vdomCode += `vdom.${vdomId} = ${handlerTokens[1]};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.__${eventType}Data = vdom.${vdomId};\n`
                    } else {
                        staticCode += `${tagId}.on${eventType} = ${avalue};\n`
                    }

                } else if (avalue.indexOf("${") >= 0) {
                    if (aname === 'className') {
                        staticCode += `${root}.__${tagId} = ${tagId};\n`

                        vdomId = makeid.possible.charAt(makeid.counter++)
                        vdomCode += `vdom.${vdomId} = ${avalue.match(/^\$\{(.*)\}$/)[1]};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.className = vdom.${vdomId};\n`
                    } else {
                        staticCode += `${root}.__${tagId} = ${tagId};\n`

                        vdomId = makeid.possible.charAt(makeid.counter++)
                        vdomCode += `vdom.${vdomId} = ${avalue.match(/^\$\{(.*)\}$/)[1]};\n`
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

        stack[stackIdx++] = parent
        parent = tagId
        for(node of node.childNodes) codegen()
        tagId = parent
        parent = stack[--stackIdx]
    } else {

        // codegenText
        if (node.data.indexOf("${") >= 0) {
            staticCode += `${root}.__${tagId} = ${tagId};\n`

            vdomId = makeid.possible.charAt(makeid.counter++)
            vdomCode += `vdom.${vdomId} = ${node.data.match(/^\$\{(.*)\}$/)[1]};\n`
            compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${tagId}.data = vdom.${vdomId};\n`
        } else {
            staticCode += `${node}.data = "${node.data}"`
        }
        // End codegenText

    }

    if (root !== tagId) {
        staticCode += `${parent}.appendChild(${tagId});\n`
    }
}

function makeid() {}
makeid.possible = "abcdefghijklmnopqrstuvwxyz"
makeid.counter = 0 

class Template {
    constructor() {
        root = undefined
        staticCode = vdomCode = compareCode = ''
        codegen()
        this.createInstanceFn = Function("scope", staticCode + `return ${root};`)
        this.update = Function("{" + args + "}", "node", "current = {}", 'const vdom = {};\n' + vdomCode + compareCode + "return vdom;")
    }
    createInstance(scope) {
        return new TemplateInstance(this, this.createInstanceFn(scope), scope)
    }
}

class TemplateInstance {
    constructor(template, node, scope) {
        this.template = template
        this.node = node
        if (scope) this.update(scope)
    }
    update(scope) {
        this.vdom = this.template.update(scope, this.node, this.vdom)
    }
}

const domc = () => {}
domc.compile = function(dom, scope) {
    args = ''
    for(arg of Object.keys(scope)) args += arg + ","
    node = dom
    return new Template()
}

export default domc
