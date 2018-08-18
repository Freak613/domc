# domc

Compile DOM node, with `${value}` syntax for dynamic values inside, into function for using as a template.

## The Gist

```javascript
import domc from 'domc'

// Given following node
// <div id="template">
//     <div>${name}</div>
//     <div>${surname}</div>
// </div>
// compile it into template
const template = domc(document.querySelector('#template'))

// Create template instance with given values
const node = template.createInstance({name: 'John', surname: 'Wick'})
container.appendChild(node)
...
// Update instance with new values
node.update({name: 'Bob', surname: 'Marley'})
```

## Performance demo

The code: https://github.com/Freak613/js-framework-benchmark/tree/master/frameworks/domc-v0.0.4-non-keyed

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

## Custom Directives

Example of directives can be found in implementation of `v-for` and `v-map` algorithms.
To create directive, we need to import `customDirectives` from domc, it's plain object,
and assign setup code to corresponding v-key.

```javascript
import {customDirectives} from 'domc'

// The setup function has following api:
// - node argument, that has this directive
// - directive is nodeAttribute value, which can be parsed for directive needs
function setup(node, directive) {
    ...
    // It should return function, that accept scope argument and produce necessary updates on node
    return function(scope) {
        ...
    }
}

// To bind setup function to directive key, extend customDirectives object
customDirectives.myDirective = setup

// After that you can call directive from template
// <div v-myDirective="arg"></div>
```

## How it works

The idea is simple:
- Walk the node and store references to dynamic parts,
- Use references in updater function to effectively update the node.

According to [morphdom](https://github.com/patrick-steele-idem/morphdom) there are some DOM properties that doesn't require additional computation and therefore they're very fast to work with.
Instead of building DOM by .createElement API calls with a lot of memory garbage, it's more effective to clone template node and use fast props to obtain references, with as less performance overhead as possible.

```javascript
// Given following node
// <tr class="${rowClass(item.id, selected)}">
//   <td class="col-md-1">${item.id}</td>
//   <td class="col-md-4">
//       <a onclick="${select(item)}">${item.label}</a>
//   </td>
//   <td class="col-md-1"><a onclick="${del(item)}"><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
//   <td class="col-md-6"></td>
// </tr>

domc(node, scope)

// This will produce function to clone and walk the node and get references to dynamic parts
// It has two arguments, template `dom` node and `scope` that used for synthethic event handlers binding
(function anonymous(dom,scope
) {
let node = dom.cloneNode(true);

let _f = node.firstChild;
let _f_f = _f.firstChild;
let _f_n = _f.nextSibling;
let _f_n_f = _f_n.firstChild;
let _f_n_f_f = _f_n_f.firstChild;
let _f_n_n = _f_n.nextSibling;
let _f_n_n_f = _f_n_n.firstChild;

node.__a = node;
node.__b = _f_f;
const c = node.__c = _f_n_f;
c.__click = scope.select;
node.__d = _f_n_f_f;
const e = node.__e = _f_n_n_f;
e.__click = scope.del;

return node;
})

// Also, codegen will produce function, that can later be used to 'rerender' instance
// It has 3 arguments:
// - destructured scope
// - root node, that has assigned references to its dynamic nodes
// - result of previous rerender call. It used to detect actual changes, something like VDOM.
(function anonymous({rowClass,selected,del,select,item,},node = this,current = node.__vdom || {}
) {
const vdom = {};
vdom.a = rowClass(item.id, selected);
vdom.b = item.id;
vdom.c = item;
vdom.d = item.label;
vdom.e = item;
if (current.a !== vdom.a) node.__a.className = vdom.a;
if (current.b !== vdom.b) node.__b.data = vdom.b;
if (current.c !== vdom.c) node.__c.__clickData = vdom.c;
if (current.d !== vdom.d) node.__d.data = vdom.d;
if (current.e !== vdom.e) node.__e.__clickData = vdom.e;
node.__vdom = vdom;
})
```