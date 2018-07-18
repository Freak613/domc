# domc

Compile real DOM node, with `${value}` syntax for dynamic values inside,
into function with DOM API calls for using as a template.

## The Gist

```javascript
import domc from 'domc'

// Given following node
// <div id="template">
//     <div>${name}</div>
//     <div>${surname}</div>
// </div>
// compile it into template
const template = domc.compile(document.querySelector('#template'))

// Create template instance with given values
const instance = template.createInstance({name: 'John', surname: 'Wick'})
container.appendChild(instance.node)
...
// Update instance with new values
instance.update({name: 'Bob', surname: 'Marley'})
```

## Performance demo

The code: https://github.com/Freak613/js-framework-benchmark/tree/master/frameworks/domc-v0.0.1-non-keyed

![Performance](performance.png?raw=true "Performance")


## Supported dynamic values syntax

Only following formats are supported currently:
- Just values: `${item}`
- Nested calls: `${item.id}`
- Function calls: `${rowClass(item.id)}`

## Synthetic Events

To achieve desired performance, to not spread page with large amount of listeners
and to not consume a lot of memory, simple implementation of synthetic events has been added.
It's inspired by Inferno's [linkEvent](https://github.com/infernojs/inferno/blob/master/README.md#linkevent-package-inferno) method.
It links handler function and fn argument to node, and use them during converting from native event.
Therefore, if you provide `onclick=${select(item)}`,
it will be parsed into `select` call and `item` as function argument.

Currently it has limitation: only one callback argument supported.
Also, it doesn't do bubbling after first handler has been met.

## How it works

The idea is simple:
- Convert live node into DOM API calls,
- Store references to dynamic parts,
- Use references in updater function to effectively update the node.

```javascript
// Given following node
// <div id="template" class="${selected}" onclick="${select(name)}">
//     <div>${name}</div>
//     <div>${surname}</div>
// </div>
const node = document.querySelector('#template')

// Tokenize
const token = tokenize(node)

// And use token to generate code for node constructor
const staticCode = token.codegen()
const generateStatic = Function("scope", staticCode)

// This will produce straightforward set of DOM API calls to instantiate the node.
// Important part that during compilation, it detects dynamic nodes,
// and extract references to them, attaching it to the root node.
// It has one argument `scope`, that used for synthethic event handlers binding
(function anonymous(scope
) {
const div11 = document.createElement("div");
div11.setAttribute("id", "template");
div11.__click = scope.select;
const div12 = document.createElement("div");
div11.appendChild(div12);
const text13 = document.createTextNode("");
div12.appendChild(text13);
div11.__text13 = text13;
const div14 = document.createElement("div");
div11.appendChild(div14);
const text15 = document.createTextNode("");
div14.appendChild(text15);
div11.__text15 = text15;
div11.__div11 = div11;
return div11;

})

// Then, generate updater
const parts = []
token.getDynamicParts(parts)
const dynamicCode = codegenUpdater(parts)

// This will produce function, that can later be used to 'rerender' instance
// It has 3 arguments:
// - scope, that will be destructured into used scope keys
// - root node, that has assigned references to its dynamic nodes
// - result of previous rerender call. It used to detect actual changes, something like VDOM.
(function anonymous({selected, name, surname},node,current = {}
) {
const vdom = {};
vdom.a = selected;
vdom.b = name;
vdom.c = name;
vdom.d = surname;

if (current.a !== vdom.a) node.__div11.className = vdom.a;
if (current.b !== vdom.b) node.__div11.__clickData = vdom.b;
if (current.c !== vdom.c) node.__text13.data = vdom.c;
if (current.d !== vdom.d) node.__text15.data = vdom.d;

return vdom
})
```