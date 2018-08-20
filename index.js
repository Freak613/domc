
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
    }

    // Inspired by walker: https://gist.github.com/cowboy/958000
    compile(root) {
        let skip = false, tmp, pathId = 'node', prevPathId, pahtIdLen, node = root, canIGoDeep
        this.codegen(node, pathId)
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
        const nodeType = node.nodeType
        
        if (nodeType !== 3) {

            // codegenAttributes
            if (node.attributes !== undefined) {
                for(let attr of node.attributes) {
                    let aname = attr.name
                    let avalue = attr.value

                    if (aname[0] === 'v' && aname[1] === '-') {
                        node.removeAttribute(aname)

                        const directive = aname.slice(2)

                        const vdomId = makeid.possible.charAt(makeid.counter++)

                        this.directiveSetupCode += `node.__${vdomId} = CD.${directive}(${pathId}, "${avalue}");\n`
                        this.directiveUpdateCode += `node.__${vdomId}(scope);\n`

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
                            this.refsCode += `const ${vdomId} = node.__${vdomId} = ${pathId};\n`
                            this.refsCode += `${vdomId}.__${eventType} = scope.${eventHandler};\n`
                            this.vdomCode += `vdom.${vdomId} = ${eventHandlerArgs};\n`    
                            this.compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.__${eventType}Data = vdom.${vdomId};\n`
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

                            this.refsCode += `node.__${vdomId} = ${pathId};\n`
                            this.vdomCode += `vdom.${vdomId} = \`${avalue.replace(/{{/g, '${').replace(/}}/g, '}')}\`;\n`
                            this.compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.className = vdom.${vdomId};\n`
                        } else {
                            const vdomId = makeid.possible.charAt(makeid.counter++)

                            this.refsCode += `node.__${vdomId} = ${pathId};\n`
                            this.vdomCode += `vdom.${vdomId} = \`${avalue.replace(/{{/g, '${').replace(/}}/g, '}')}\`;\n`
                            this.compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.setAttribute("${aname}", vdom.${vdomId});\n`
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
            let nodeData = node.nodeValue
            if (nodeData.indexOf("{{") >= 0) {
                const vdomId = makeid.possible.charAt(makeid.counter++)

                this.refsCode += `node.__${vdomId} = ${pathId};\n`
                this.vdomCode += `vdom.${vdomId} = \`${nodeData.replace(/{{/g, '${').replace(/}}/g, '}')}\`;\n`
                this.compareCode +=`if (current.${vdomId} !== vdom.${vdomId}) node.__${vdomId}.nodeValue = vdom.${vdomId};\n`

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
        return Function("node", "scope", "CD", this.varCode + '\n' + this.refsCode + '\n' + this.directiveSetupCode)
    }
    updateFn() {
        let argsStr = ''
        for(let arg of Object.keys(this.scopeVars)) argsStr += arg + ","   
        return Function("scope", `const node = this;\n\n${this.vdomCode.length > 0 ? `const {${argsStr}} = scope;\nconst current = node.__vdom || {};\n\nconst vdom = {};\n${this.vdomCode}\n${this.compareCode}\nnode.__vdom = vdom;\n` : ''}${this.directiveUpdateCode}`)
    }
}
 
class Template {
    constructor(dom, createFn, updateFn) {
        this.dom = dom
        this.create = createFn
        this.update = updateFn
    }
    createInstance(scope) {
        const node = this.dom.cloneNode(true)
        this.create(node, scope, customDirectives)
        node.update = this.update
        node.update(scope)
        return node
    }
    rehydrate(scope) {
        this.create(this.dom, scope, customDirectives)
        this.dom.update = this.update
        this.dom.update(scope)
    }
}

export function domc(dom) {
    const c = new Compiler()
    c.compile(dom)
    // console.debug(c.scopeVars)
    const createFn = c.createFn()
    const updateFn = c.updateFn()
    console.debug({createFn, updateFn})
    return new Template(dom, createFn, updateFn)
}

export default domc
