
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

function makeid() {}
makeid.possible = "abcdefghijklmnopqrstuvwxyz"
makeid.counter = 0


export const customDirectives = {}

class Compiler {
    constructor() {
        this.varCode = 
        this.vdomCode = 
        this.compareCode = 
        this.refsCode = 
        this.directiveSetupCode = 
        this.directiveUpdateCode = ''

        this.scopeVars = {}
        this.component = null
    }

    // Inspired by walker: https://gist.github.com/cowboy/958000
    compile(root) {
        let skip = false, tmp, pathId = 'node', prevPathId, pahtIdLen, node = root, canIGoDeep
        canIGoDeep = this.codegen(node, pathId)
        if (canIGoDeep > 0) return
        pathId = ''
        do {
            if (!skip && (tmp = node.firstChild)) {
                if (tmp.nodeType === 3 && tmp.nodeValue.trim() === "") {
                    tmp.parentNode.removeChild(tmp)
                    continue
                }
                skip = false

                prevPathId = pathId
                pathId += '_f'
                this.varCode += `let ${pathId} = ${prevPathId || 'node'}.firstChild;\n` 
                
                canIGoDeep = this.codegen(tmp, pathId)
                if (canIGoDeep > 0) skip = true
            } else if (tmp = node.nextSibling) {
                if (tmp.nodeType === 3 && tmp.nodeValue.trim() === "") {
                    tmp.parentNode.removeChild(tmp)
                    continue
                }
                skip = false

                prevPathId = pathId
                pathId += '_n'
                this.varCode += `let ${pathId} = ${prevPathId || 'node'}.nextSibling;\n` 
                
                canIGoDeep = this.codegen(tmp, pathId)
                if (canIGoDeep > 0) skip = true
            } else {
                pahtIdLen = pathId.length
                if (pathId[pahtIdLen - 1] === 'n') {
                    pathId = pathId.slice(0, pathId.lastIndexOf('_f_n'))
                } else {
                   pathId = pathId.slice(0, pahtIdLen- 2) 
                }
                tmp = node.parentNode
                skip = true
            }
            node = tmp
            if (node === root) break
        } while (node)

        // this.codeopt()
    }

    codegen(node, pathId) {
        let nodeType = node.nodeType,
            tag = node.nodeName

        if (nodeType === 8) {
            const nodeData = node.nodeValue.trim()
            if (nodeData[0] === '#') {
                if (nodeData[1] === '#') {
                    this.directiveSetupCode += `for(let i = 0; i < scope.${nodeData.slice(2)}.length; i++) ${pathId}.parentNode.insertBefore(scope.${nodeData.slice(2)}[i], ${pathId});\n${pathId}.parentNode.removeChild(${pathId});\n`
                } else {
                    this.directiveSetupCode += `${pathId}.parentNode.replaceChild(scope.${nodeData.slice(1)}, ${pathId});\n`    
                }
            }
            return 0
        }
        
        if (nodeType !== 3) {

            // codegenAttributes
            if (node.attributes !== undefined) {
                for(let attr of node.attributes) {
                    let aname = attr.name
                    let avalue = attr.value

                    if (aname[0] === 'i' && aname[1] === 's') {
                        node.removeAttribute(aname)
                        if (pathId === 'node') {
                            this.component = customDirectives[avalue]
                        } else {
                            const vdomId = makeid.possible.charAt(makeid.counter++)

                            this.directiveSetupCode += `let __${vdomId} = utils["${avalue}"](scope, ${pathId});\n${pathId}.parentNode.replaceChild(__${vdomId}, ${pathId});\n`
                            this.directiveUpdateCode += `  __${vdomId}.update(scope);\n`
                        }
                        return 1
                    }

                    if (aname[0] === 'v' && aname[1] === '-') {
                        node.removeAttribute(aname)

                        const directive = aname.slice(2)

                        const vdomId = makeid.possible.charAt(makeid.counter++)

                        this.directiveSetupCode += `let __${vdomId} = utils.${directive}(${pathId}, "${avalue}");\n`
                        this.directiveUpdateCode += `    __${vdomId}(scope);\n`

                        return 1
                    }

                    if (aname[0] === 'o' && aname[1] === 'n') {

                        const eventType = aname.slice(2)
                        setupSyntheticEvent(eventType)

                        const reactiveValue = avalue
                        const parenIdx = reactiveValue.indexOf("(")
                        
                        let eventHandler, eventHandlerArgs
                        if (parenIdx >= 0) {
                            eventHandler = reactiveValue.slice(0, parenIdx)
                            const eventHandlerArgsStr = reactiveValue.slice(parenIdx + 1, reactiveValue.length - 1)
                            if (eventHandlerArgsStr.length > 0) {
                                eventHandlerArgs = eventHandlerArgsStr.split(',')
                            } else {
                                eventHandlerArgs = []
                            }
                        } else {
                            eventHandler = reactiveValue
                            eventHandlerArgs = []
                        }

                        if (eventHandlerArgs.length > 0) {
                            const vdomId = makeid.possible.charAt(makeid.counter++)
                            this.refsCode += `${pathId}.__${eventType} = scope.${eventHandler};\n`
                            this.vdomCode += `    vdom.${vdomId} = ${eventHandlerArgs};\n`    
                            this.compareCode +=`    if (current.${vdomId} !== vdom.${vdomId}) ${pathId}.__${eventType}Data = vdom.${vdomId};\n`
                        } else {
                            this.refsCode += `${pathId}.__${eventType} = scope.${eventHandler};\n`
                        }

                        node.removeAttribute(aname)

                        for(let i = 0, code, token; i < eventHandlerArgs.length; i++) {
                            token = eventHandlerArgs[i]
                            code = token.charCodeAt(0)
                            if (code >= 97 && code <= 122) {
                                if (token.indexOf('.') >= 0) {
                                    this.scopeVars[token.slice(0, token.indexOf('.'))] = true    
                                } else {
                                    this.scopeVars[token] = true
                                }
                            }
                        }

                    } else if (avalue.indexOf("{{") >= 0) {
                        if (aname === 'class') {
                            const vdomId = makeid.possible.charAt(makeid.counter++)

                            this.vdomCode += `    vdom.${vdomId} = \`${avalue.replace(/{{/g, '${').replace(/}}/g, '}')}\`;\n`
                            this.compareCode +=`    if (current.${vdomId} !== vdom.${vdomId}) ${pathId}.className = vdom.${vdomId};\n`
                        } else {
                            const vdomId = makeid.possible.charAt(makeid.counter++)

                            this.vdomCode += `    vdom.${vdomId} = \`${avalue.replace(/{{/g, '${').replace(/}}/g, '}')}\`;\n`
                            this.compareCode +=`    if (current.${vdomId} !== vdom.${vdomId}) ${pathId}.setAttribute("${aname}", vdom.${vdomId});\n`
                        }

                        let dIdx, eIdx, tokens
                        while((dIdx = avalue.indexOf('{{')) >= 0) {
                            eIdx = avalue.indexOf('}}')
                            tokens = avalue.slice(dIdx + 2, eIdx).split(/[\s\(\)]/g)
                            for(let i = 0, code, token; i < tokens.length; i++) {
                                token = tokens[i]
                                code = token.charCodeAt(0)
                                if (code >= 97 && code <= 122) {
                                    if (token.indexOf('.') >= 0) {
                                        this.scopeVars[token.slice(0, token.indexOf('.'))] = true    
                                    } else {
                                        this.scopeVars[token] = true
                                    }
                                }
                            }
                            avalue = avalue.slice(eIdx + 1)
                        }

                        node.removeAttribute(aname)
                    }   
                }
            }
            // End codegenAttributes

        } else {

            // codegenText
            let nodeData = node.nodeValue.trim()

            if (nodeData.indexOf("{{") >= 0) {
                const vdomId = makeid.possible.charAt(makeid.counter++)

                this.vdomCode += `    vdom.${vdomId} = \`${nodeData.replace(/{{/g, '${').replace(/}}/g, '}')}\`;\n`
                this.compareCode +=`    if (current.${vdomId} !== vdom.${vdomId}) ${pathId}.nodeValue = vdom.${vdomId};\n`

                node.nodeValue = ""

                let dIdx, eIdx, tokens
                while((dIdx = nodeData.indexOf('{{')) >= 0) {
                    eIdx = nodeData.indexOf('}}')
                    tokens = nodeData.slice(dIdx + 2, eIdx).split(/[\s\(\)]/g)
                    for(let i = 0, code, token; i < tokens.length; i++) {
                        token = tokens[i]
                        code = token.charCodeAt(0)
                        if (code >= 97 && code <= 122) {
                            if (token.indexOf('.') >= 0) {
                                this.scopeVars[token.slice(0, token.indexOf('.'))] = true    
                            } else {
                                this.scopeVars[token] = true
                            }
                        }
                    }
                    nodeData = nodeData.slice(eIdx + 1)
                }
            }
            // End codegenText

        }

        if (tag.indexOf('-') > 0) {
            if (pathId === 'node') {
                this.component = customDirectives[tag.toLowerCase()]
            } else {
                const vdomId = makeid.possible.charAt(makeid.counter++)

                this.directiveSetupCode += `let __${vdomId} = utils["${tag.toLowerCase()}"](scope, ${pathId});\n${pathId}.parentNode.replaceChild(__${vdomId}, ${pathId});\n`
                this.directiveUpdateCode += `  __${vdomId}.update(scope);\n`
            }
            return 1
        }

        return 0
    }

    // codeopt() {
    //     let varCode = this.varCode,
    //         refsCode = this.refsCode

    //     if (varCode.length === 0) return

    //     const vars = varCode.match(/_f\w*/g)
    //     let i = vars.length, _var
    //     while(--i) {
    //         _var = vars[i]
    //         if (varCode.indexOf(` ${_var}.`) === -1 && refsCode.indexOf(` ${_var};`) === -1) {
    //             varCode = varCode.replace(new RegExp(`let ${_var} = .*?;\n`), '')
    //         }
    //     }

    //     this.varCode = varCode
    // }

    createFn() {
        if (this.component) return this.component

        let argsStr = ''
        for(let arg of Object.keys(this.scopeVars)) argsStr += arg + ","   
        return Function("scope", "node", "utils", "rehydrate",
            'if (rehydrate !== true) node = node.cloneNode(true);\n' + this.varCode + '\n' + this.refsCode + '\n' + this.directiveSetupCode + '\n' +
            `let current = {};\nnode.update = function(scope) {\n${this.vdomCode.length > 0 ? `    const {${argsStr}} = scope;\n\n    const vdom = {};\n${this.vdomCode}\n${this.compareCode}\n    current = vdom;\n` : ''}${this.directiveUpdateCode}}\n` +
            'return node;')
    }
    // updateFn() {
    //     let argsStr = ''
    //     for(let arg of Object.keys(this.scopeVars)) argsStr += arg + ","   
    //     return Function("scope", `const node = this;\n\n${this.vdomCode.length > 0 ? `const {${argsStr}} = scope;\nconst current = node.__vdom || {};\n\nconst vdom = {};\n${this.vdomCode}\n${this.compareCode}\nnode.__vdom = vdom;\n` : ''}${this.directiveUpdateCode}`)
    // }
}
 
class Template {
    constructor(dom, createFn) {
        this.dom = dom
        this.create = createFn
    }
    createInstance(scope) {
        const node = this.create(scope, this.dom, customDirectives)
        node.update(scope)
        return node
    }
    rehydrate(scope) {
        this.create(scope, this.dom, customDirectives, true)
        this.dom.update(scope)
    }
}

export function domc(dom) {
    const c = new Compiler()
    c.compile(dom)
    const createFn = c.createFn()
    // console.debug({createFn, dom})
    return new Template(dom, createFn)
}

domc.customDirectives = customDirectives

const compilerTemplate = document.createElement('template')
domc.component = function(tag, template, localStateFn) {
    compilerTemplate.innerHTML = template.trim()
    let cNode = domc(compilerTemplate.content.firstChild)

    function createFn(scope, orig) {
        if (localStateFn === undefined && orig !== undefined && orig.attributes.length === 0 && orig.firstChild === null) return cNode.createInstance(scope)

        let varsFn
        if (orig !== undefined && orig.attributes.length > 0) {
            let varsCode = ''
            for(let attr of orig.attributes) {
                varsCode += `scope["${attr.name}"] = scope["${attr.value}"];\n`
            }
            varsFn = Function("scope", varsCode)
        }

        let localScope = Object.assign({
            nodeRender: () => updateFn(localScope)
        }, scope)

        if (orig !== undefined && orig.firstChild !== null) {
            localScope.children = Array.from(orig.childNodes)
        }

        if (varsFn) varsFn(localScope)

        let localState = {}
        if (localStateFn) {
            localState = localStateFn(localScope)
            localScope = Object.assign(localScope, localState)
        }

        let node = cNode.createInstance(localScope)

        let updateFn = node.update
        node.update = function(scope) {
            localScope = Object.assign(localScope, scope, localState)
            if (varsFn) varsFn(localScope)
            updateFn(localScope)
        }
        return node
    }

    domc.customDirectives[tag] = createFn
    return function(scope) {
        let node
        scope.render = () => node.update(scope)
        return node = createFn(scope)
    }
}

export default domc
