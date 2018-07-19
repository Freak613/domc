
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
const setupSyntheticEvent = name => {
    if (CONFIGURED_SYNTHETIC_EVENTS[name]) return
    document.addEventListener(name, event => nativeToSyntheticEvent(event, name))
    CONFIGURED_SYNTHETIC_EVENTS[name] = true
}

// Core

let tagCounter = 0

const codegenAttributes = (dom, node, dynamicParts) => {
    if (!dom.attributes) return []

    let staticParts = []

    for(let i = 0; i < dom.attributes.length; i++) {
        let name = dom.attributes[i].name
        let value = dom.attributes[i].value

        if (name === 'class') name = 'className'

        if (name.match(/^on/)) {
            const eventType = name.replace(/^on/, '')
            setupSyntheticEvent(eventType)
            if (value.indexOf("${") >= 0) {
                const reactiveValue = value.replace(/^\${/, '').replace(/}$/, '')
                const handlerName = reactiveValue.match(/^.*?\(/)[0].replace('(', '')
                const argument = reactiveValue.match(/\(.*?\)/)[0].replace(/[\(\)]/g, '')

                staticParts.push(`${node}.__${eventType} = scope.${handlerName};\n`)

                dynamicParts.push({
                    ref: node,
                    getter: argument,
                    setter: value => `node.__${node}.__${eventType}Data = ${value};\n`
                })
            } else {
                staticParts.push(`${node}.on${eventType} = ${value};\n`)
            }
        } else if (value.indexOf("${") >= 0) {
            if (name === 'className') {
                dynamicParts.push({
                    ref: node,
                    getter: value,
                    setter: value => `node.__${node}.className = ${value};\n`
                })
            } else {
                dynamicParts.push({
                    ref: node,
                    getter: value,
                    setter: value => `node.__${node}.setAttribute("${name}", ${value});\n`
                })
            }
        } else {
            if (name === 'className') {
                staticParts.push(
                    `${node}.${name} = "${value}";\n`
                )
            } else {
                staticParts.push(
                    `${node}.setAttribute("${name}", "${value}");\n`
                )
            }
        }        
    }

    return staticParts
}
const codegenText = (dom, node, dynamicParts) => {
    if (dom.data.indexOf("${") >= 0) {
        dynamicParts.push({
            ref: node,
            getter: dom.data,
            setter: value => `node.__${node}.data = ${value};\n`
        })
        return ''
    } else {
        return `${node}.data = "${node.data}"`
    }
}
const codegenStatic = (node, dynamicParts, parent, root) => {
    let tagId, tag, createElement
    if (node.nodeType === 3) {
        if (node.data.trim() === '') return
        tag = ''
        tagId = 'text' + (++tagCounter)
        createElement = 'createTextNode'
    } else {
        tag = node.tagName.toLowerCase()
        tagId = tag + (++tagCounter)
        createElement = 'createElement'
    }
    const head = `const ${tagId} = document.${createElement}("${tag}");\n`
    
    if (!root) root = tagId
    
    let content, attributes
    if (node.nodeType === 3) {
        attributes = ''
        content = codegenText(node, tagId, dynamicParts)
    } else {
        attributes = codegenAttributes(node, tagId, dynamicParts).join('')
        content = [...node.childNodes].map(c => codegenStatic(c, dynamicParts, tagId, root)).join('')
    }

    let tail
    if (root === tagId) {

        tail = `\
${dynamicParts.map(({ref}) => `${root}.__${ref} = ${ref};\n`).join('')}\
return ${tagId};\n`

    } else {
        tail = `${parent}.appendChild(${tagId});\n`
    }

    return `${head}${attributes}${content}${tail}`
}

function makeid() {
  var text = "";
  var possible = "abcdefghijklmnopqrstuvwxyz";

  text = possible.charAt(makeid.counter++);

  if (makeid.counter === possible.length) makeid.counter = 0
  return text;
}
makeid.counter = 0

const clearBrackets = parts => parts.map(p => p.getter = p.getter.replace(/^\${/, '').replace(/}$/, ''))
const buildArgumentsToken = parts => {
    const argumentKeys = {}

    parts.map(({getter}) =>
        getter.split(/[(),]/)
        .filter(v => !!v)
        .map(v => v.trim().replace(/\..*$/, ''))
        .map(token => argumentKeys[token] = true))

    return `{${Object.keys(argumentKeys).join(', ')}}`
}
const codegenUpdater = parts => {
    makeid.counter = 0
    
    clearBrackets(parts)

    const argumentsToken = buildArgumentsToken(parts)

    const head = "const vdom = {};\n"

    const buildVDOM = parts.map(({getter}) => `vdom.${makeid()} = ${getter};\n`).join('')
    
    makeid.counter = 0

    const compareVDOM = parts.map(({setter}) => {
        const vdomId = makeid()
        return `if (current.${vdomId} !== vdom.${vdomId}) ${setter(`vdom.${vdomId}`)}`
    }).join('')
    
    const tail = "return vdom;"

    const code = `${head}${buildVDOM}\n${compareVDOM}${tail}`
    
    return {code, argumentsToken}
}

class Template {
    constructor(node) {
        const parts = []
        const code = codegenStatic(node, parts)
        this.createInstanceFn = Function("scope", code)
        const dynamicCode = codegenUpdater(parts)
        this.update = Function(dynamicCode.argumentsToken, "node", "current = {}", dynamicCode.code)
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
domc.compile = node => new Template(node)

export default domc
