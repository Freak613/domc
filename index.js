
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

const EVENT_HANDLER_REGEX = new RegExp(/^on/)

let tagCounter = 0

let root, node, staticParts, dynamicParts

let tagName, tag, tagId, createElement, parent,
attr, aname, avalue, eventType, 
reactiveValue, handlerTokens, part

const ATTR_SETTERS = {
    event: (tagId, eventType) => `node.__${tagId}.__${eventType}Data = #value;\n`,
    className: tagId => `node.__${tagId}.className = #value;\n`,
    setAttribute: (tagId, aname) => `node.__${tagId}.setAttribute("${aname}", #value);\n`
}
const TEXT_SETTER = tagId => `node.__${tagId}.data = #value;\n`

let stack = [], stackIdx = 0
function codegenStatic() {
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
    staticParts.push(`const ${tagId} = document.${createElement}("${tag}");\n`)
    
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
                        reactiveValue = avalue.replace(/^\${/, '').replace(/}$/, '')
                        handlerTokens = reactiveValue.split(/[\(\)]/)

                        staticParts.push(`${tagId}.__${eventType} = scope.${handlerTokens[0]};\n`)

                        dynamicParts.push({
                            ref: tagId,
                            getter: handlerTokens[1],
                            setter: ATTR_SETTERS.event(tagId, eventType)
                        })
                    } else {
                        staticParts.push(`${tagId}.on${eventType} = ${avalue};\n`)
                    }

                } else if (avalue.indexOf("${") >= 0) {
                    if (aname === 'className') {
                        dynamicParts.push({
                            ref: tagId,
                            getter: avalue,
                            setter: ATTR_SETTERS.className(tagId)
                        })
                    } else {
                        dynamicParts.push({
                            ref: tagId,
                            getter: avalue,
                            setter: ATTR_SETTERS.setAttribute(tagId, aname)
                        })
                    }
                } else {
                    if (aname === 'className') {
                        staticParts.push(
                            `${tagId}.${aname} = "${avalue}";\n`
                        )
                    } else {
                        staticParts.push(
                            `${tagId}.setAttribute("${aname}", "${avalue}");\n`
                        )
                    }
                }     
            }
        }
        // End codegenAttributes

        stack[stackIdx] = parent
        parent = tagId
        stackIdx++
        for(node of node.childNodes) codegenStatic()
        stackIdx--
        tagId = parent
        parent = stack[stackIdx]
    } else {

        // codegenText
        if (node.data.indexOf("${") >= 0) {
            dynamicParts.push({
                ref: tagId,
                getter: node.data,
                setter: TEXT_SETTER(tagId)
            })
        } else {
            staticParts.push(`${node}.data = "${node.data}"`)
        }
        // End codegenText

    }

    if (root === tagId) {
        for(part of dynamicParts) staticParts.push(`${root}.__${part.ref} = ${part.ref};\n`)
        staticParts.push(`return ${tagId};`)
        return Function("scope", staticParts.join(''))
    } else {
        staticParts.push(`${parent}.appendChild(${tagId});\n`)
    }
}

function makeid() {}
makeid.possible = "abcdefghijklmnopqrstuvwxyz"
makeid.counter = 0

let vdomId, parts, code, buildDomIdx, compareDomIdx, argumentKeys, argumentsToken
function codegenUpdater() {
    parts = dynamicParts

    makeid.counter = 0

    code = ["const vdom = {};\n"]
    code.length = parts.length * 2 + 2
    
    buildDomIdx = 1
    compareDomIdx = 1 + parts.length

    argumentKeys = {}

    for(part of parts) {
        part.getter = part.getter.replace(/^\${/, '').replace(/}$/, '')

        part.getter.split(/[(),]/)
        .filter(v => !!v)
        .map(v => v.trim().replace(/\..*$/, ''))
        .map(token => argumentKeys[token] = true) 

        vdomId = makeid.possible.charAt(makeid.counter++)
        code[buildDomIdx] = `vdom.${vdomId} = ${part.getter};\n`
        code[compareDomIdx] = `if (current.${vdomId} !== vdom.${vdomId}) ${part.setter.replace('#value', `vdom.${vdomId}`)}`
        buildDomIdx++
        compareDomIdx++
    }

    argumentsToken = `{${Object.keys(argumentKeys).join(', ')}}`
    
    code.push("return vdom;")
    
    return Function(argumentsToken, "node", "current = {}", code.join(''))
}

class Template {
    constructor() {
        root = undefined
        staticParts = []
        dynamicParts = []
        this.createInstanceFn = codegenStatic()
        this.update = codegenUpdater()
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
domc.compile = function(dom) {
    node = dom
    return new Template()
}

export default domc
