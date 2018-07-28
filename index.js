
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

let attr, aname, avalue, eventType, 
reactiveValue,
vdomCode, compareCode, args, 
vdomId, arg, refsCode, 
nodeData, eventHandler, parenIdx,
eventHandlerArgs, varCode, nodeType

function codegen(node, pathId) {
    nodeType = node.nodeType
    
    if (nodeType !== 3) {

        // codegenAttributes
        if (node.attributes !== undefined) {
            for(attr of node.attributes) {
                aname = attr.name
                avalue = attr.value

                if (aname[0] === 'o' && aname[1] === 'n') {

                    eventType = aname.slice(2)
                    setupSyntheticEvent(eventType)

                    if (avalue.indexOf("${") >= 0) {
                        reactiveValue = avalue.slice(2, avalue.length - 1)
                        parenIdx = reactiveValue.indexOf("(")
                        eventHandler = reactiveValue.slice(0, parenIdx)
                        eventHandlerArgs = reactiveValue.slice(parenIdx + 1, reactiveValue.length - 1).split(',')

                        vdomId = makeid.possible.charAt(makeid.counter++)

                        refsCode += `const ${vdomId} = node.__${vdomId} = ${pathId};\n`
                        refsCode += `${vdomId}.__${eventType} = scope.${eventHandler};\n`
                        vdomCode += `vdom.${vdomId} = ${eventHandlerArgs};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.__${eventType}Data = vdom.${vdomId};\n`

                        node.removeAttribute(aname)
                    }

                } else if (avalue.indexOf("${") >= 0) {
                    if (aname === 'class') {
                        vdomId = makeid.possible.charAt(makeid.counter++)

                        refsCode += `node.__${vdomId} = ${pathId};\n`
                        vdomCode += `vdom.${vdomId} = ${avalue.slice(2, avalue.length - 1)};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.className = vdom.${vdomId};\n`
                    } else {
                        vdomId = makeid.possible.charAt(makeid.counter++)

                        refsCode += `node.__${vdomId} = ${pathId};\n`
                        vdomCode += `vdom.${vdomId} = ${avalue.slice(2, avalue.length - 1)};\n`
                        compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.setAttribute("${aname}", vdom.${vdomId});\n`
                    }

                    node.removeAttribute(aname)
                }   
            }
        }
        // End codegenAttributes

    } else {

        // codegenText
        nodeData = node.nodeValue
        if (nodeData.indexOf("${") >= 0) {
            vdomId = makeid.possible.charAt(makeid.counter++)

            refsCode += `node.__${vdomId} = ${pathId};\n`
            vdomCode += `vdom.${vdomId} = ${nodeData.slice(2, nodeData.length - 1)};\n`
            compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.data = vdom.${vdomId};\n`

            node.nodeValue = ""
        }
        // End codegenText

    }
}

// Inspired by: https://gist.github.com/cowboy/958000
function walker(node) {
    let skip = false, tmp
    let pathId = 'node', prevPathId
    codegen(node, pathId)
    pathId = ''
    do {
        if (!skip && (tmp = node.firstChild)) {
            if (tmp.nodeType === 3 && tmp.nodeValue.trim() === "") {
                tmp.parentNode.removeChild(tmp)
                continue
            }

            prevPathId = pathId
            pathId += '_f'
            varCode += `let ${pathId} = ${prevPathId || 'node'}.firstChild;\n` 
            
            codegen(tmp, pathId)

            skip = false
        } else if (tmp = node.nextSibling) {
            if (tmp.nodeType === 3 && tmp.nodeValue.trim() === "") {
                tmp.parentNode.removeChild(tmp)
                continue
            }

            prevPathId = pathId
            pathId += '_n'
            varCode += `let ${pathId} = ${prevPathId || 'node'}.nextSibling;\n` 
            
            codegen(tmp, pathId)

            skip = false
        } else {
            pathId = pathId.slice(0, pathId.length - 2)
            tmp = node.parentNode
            skip = true
        }
        node = tmp
    } while (node)
}

function makeid() {}
makeid.possible = "abcdefghijklmnopqrstuvwxyz"
makeid.counter = 0

function codeopt() {
    const vars = varCode.match(/_f\w*/g)
    let i = vars.length, _var
    while(--i) {
        _var = vars[i]
        if (varCode.indexOf(` ${_var}.`) === -1 && refsCode.indexOf(` ${_var};`) === -1) {
            varCode = varCode.replace(new RegExp(`let ${_var} = .*?;\n`), '')
        }
    }
}
 
let templateInstance
class Template {
    constructor(dom) {
        varCode = vdomCode = compareCode = refsCode = ''
        this.dom = dom
        walker(dom)
        codeopt()
        this.create = Function("dom", "scope", `let node = dom.cloneNode(true);\n\n` + varCode + '\n' + refsCode + `\nreturn node;`)
        this.update = Function("{" + args + "}", "node = this", "current = node.__vdom || {}", 'const vdom = {};\n' + vdomCode + compareCode + "node.__vdom = vdom;")
    }
    createInstance(scope) {
        templateInstance = this.create(this.dom, scope)
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
