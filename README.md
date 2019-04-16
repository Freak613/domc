# domc

Compile DOM node, with `{{ value }}` mustache syntax for dynamic values inside, into function for using as a template.

## To be done/Not implemented
- Conditional rendering with v-if

## The Gist

```javascript
import domc from 'domc'

// Given following node
// <div id="template">
//     <div>{{ name }}</div>
//     <div>{{ surname }}</div>
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

https://github.com/Freak613/js-framework-benchmark/tree/master/frameworks/keyed/domc

![Performance](performance.png?raw=true "Performance")

## Size
2.33Kb `index.js` + 1.08Kb `vFor.js`


## Supported dynamic values syntax

Only following formats are supported currently:
- Just values: `{{ item }}`
- Nested calls: `{{ item.id }}`
- Function calls: `{{ rowClass(item.id) }}`

## Synthetic Events

To achieve desired performance, to not spread page with large amount of listeners
and to not consume a lot of memory, simple implementation of synthetic events has been added.
It's inspired by Inferno's [linkEvent](https://github.com/infernojs/inferno/blob/master/README.md#linkevent-package-inferno) method.
It links handler function and fn argument to node, and use them during converting from native event.
Therefore, if you provide `onclick="select(item)"`,
it will be parsed into `select` call and `item` as function argument.

Currently it has limitation: only one callback argument supported.
Also, it doesn't do bubbling after first handler has been met.

## Components

It's possible to create components in JS code.

`scope` is key concept of domc. If you coming from React background, it's idea of `props` and Context API merged into one entity. All templates work in some scope and scope is automatically passed down the DOM tree. All components and directives can extend scope, deeper you go and more extended scope becomes, having all scope vars starting from root component. It eliminates need to manually passing props if source and target have some intermediate components between them.

Components are defined using tag name, it follows Custom Elements naming convention i.e. tag should have at least one dash symbol in the name to be considered as a component.
All components should be registered in domc before they've been used.

There are two ways of calling components in templates:
- Using tag directly `<my-component/>`
- Or using `is` attribute: `<tr is="my-component">`. It's used to overcome some DOM limitations, when you can't put custom component in DOM tree, for example `tbody` could have only `tr` children elements.

Components could be either stateless or stateful. If parent scope have enough data for component, it doesn't require own scope to be defined.

```javascript
domc.component('todo-item', `
<li>
    <div>{{ todo.text }}</div>
</li>
`)
domc.component('app-body', `
<div id="app-4">
  <ol>
    <todo-item v-for="todo of todos"/>
  </ol>
</div>`)
```

To make stateful component or to redefine some props from parent scope, domc.component function accepts templateObject argument.

Components could have props defined in template directly. They will be mapped from parent's scope automatically.
Currently no JS values allowed in mapped props.

```javascript
domc.component('app-body', `
<div id="app-4">
  <ol>
    <todo-item v-for="todo of todos" some-custom-prop1="parentVar1" some-custom-prop2="parentVar2"/>
  </ol>
</div>`)
```

So, basic example looks like this:

```javascript
// Register component with tag 'todo-item'
domc.component('todo-item', {
    // Components have two lifecycle events:
    // `create` used for creating initial values and event handlers
    create: scope => {
        return {
            localVar: 'me'
        }
    },
    // `update` will be called on every node.update call, either from nodeRender or from render
    // We can use it to react on scope changes
    update: scope => {
        return {
            someCond: scope.localVar === 'me' ? 'yes' : 'no'
        }
    },
    template: `
        <li>
            <div>{{ item.text }} {{ localVar }} {{ someCond }}</div>
        </li>
    `
})

// domc.app returns function to render component as starting point of application
const c = domc.app(`
<div id="app-4">
  <ol>
    <todo-item v-for="todo of todos" item="todo"/>
  </ol>
</div>`)

const scope = {
    todos: [
        {text: 'me'},
        {text: 'you'}
    ]
}

// Create app Node
const app = c(scope)
document.body.appendChild(app)

// Make some changes and update
scope.todos[0].text = 'you'
scope.todos[1].text = 'me'
app.update(scope)
```

If we have event handlers, we should manually call `render` function that is automatically coming from scope. It will rerender full app. If we need to trigger update only on DOM tree branch starting component's node, we can call `nodeRender` function from the scope. Both doesn't accepts any arguments, scope will be automatically used in updates.

```javascript
domc.component('app-body', {
    create: scope => {
        const {render, nodeRender} = scope

        const init = {
            myVar: 'me',
            update: () => {
                // Init object should not be modified. We use `scope` to work with component state
                scope.myVar = 'you'
                
                // Rerender full app
                render()

                // OR rerender node
                nodeRender()
            }
        }

        return init
    },
    template: `
        <div id="app-4" onclick="update">
          <h1>{{ myVar }}</h1>
        </div>`
})
```

## Slots

It's possible to insert other Nodes into template.

```javascript
domc.component('app', `
<div>
    <!-- #oneNode -->

    <!-- ##manyNodes -->
</div>
`,
scope => {
    return {
        oneNode: document.createElement('div'),
        manyNodes: [document.createElement('div'), document.createElement('div')]
    }
})
```

For Components, scope will contain `children` array to insert in result Node

```javascript
domc.component('container-component', `
<div>
    <!-- ##children -->
</div>
`)

domc.component('app', `
<container-component>
    <div>1</div>
    <div>2</div>
    <div>3</div>
</container-component>
`)
```

## Styles

Inline styles are supported in following ways:
- As a simple non-dynamic argument, `<div style="display: flex;"></div>`
- As dynamic object argument: `<div style="{{ style }}"></div>`. It will be diffed on update and only changed variable will be applied to element style.

As a way to organizing styles, domc have small `styles` CSS-in-JS utility. It will generate necessary classNames and inline styles, along with update function. Style rules will be inserted into generated `style` tag in the document head.

```javascript
import styles from 'domc/styles'

// Static styles
const s = styles({
    base: {
        display: 'flex',
        // pseudo-classes and pseudo-selectors are supported
        '::before': {
            content: '>'
        }
    }
})
// s will have s.base === 'base-a'
// styles will generate uniq alphabet tokens and append it to the end of className

// Dynamic styles
// Used to generate styles per component instance, from scope props
const s = styles(({color}) => ({
    base: {
        display: 'flex',
        color
    }
}))
const instanceStyles = s({color: 'black'})
// instanceStyles.base === 'base-b'

// With inline styles
// Used for highly dynamic values, when creating new style every time meaningless
const s = styles(({color}) => ({
    base: {
        display: 'flex',
        color,
        // inline should be function
        inline: ({posX, posY}) => ({
            top: posY + 'px',
            left: posX + 'px'
        })
    }
}))
const instanceStyles = s({color: 'black', posX: 0, poxY: 0})
// instanceStyles.base === 'base-c'
// instanceStyles.inline.base === {top: '0px', left: '0px'}
...
instanceStyles({posX: 100, posY: 200})
// instanceStyles.inline.base === {top: '100px', left: '200px'}
```

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
// <tr class="{{ item.id === selected ? 'danger' : '' }}">
//   <td class="col-md-1">{{ item.id }}</td>
//   <td class="col-md-4">
//       <a onclick="select(item)">{{ item.label }}</a>
//   </td>
//   <td class="col-md-1"><a onclick="del(item)"><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
//   <td class="col-md-6"></td>
// </tr>

domc(node)

// This will produce function to clone and walk the node and get references to dynamic parts
// Also, codegen will produce update function, that can later be used to 'rerender' instance

(function anonymous(scope,node,utils,rehydrate
) {
if (rehydrate !== true) node = node.cloneNode(true);
let _f = node.firstChild;
let _f_f = _f.firstChild;
let _f_n = _f.nextSibling;
let _f_n_f = _f_n.firstChild;
let _f_n_f_f = _f_n_f.firstChild;
let _f_n_n = _f_n.nextSibling;
let _f_n_n_f = _f_n_n.firstChild;
let _f_n_n_f_f = _f_n_n_f.firstChild;
let _f_n_n_n = _f_n_n.nextSibling;

_f_n_f.__click = scope.select;
_f_n_n_f.__click = scope.del;


let current = {};
node.update = function(scope) {
    const {item,selected,} = scope;

    const vdom = {};
    vdom.a = `${item.id === selected ? 'danger' : ''}`;
    vdom.b = `${item.id}`;
    vdom.c = item;
    vdom.d = `${item.label}`;
    vdom.e = item;

    if (current.a !== vdom.a) node.className = vdom.a;
    if (current.b !== vdom.b) _f_f.nodeValue = vdom.b;
    if (current.c !== vdom.c) _f_n_f.__clickData = vdom.c;
    if (current.d !== vdom.d) _f_n_f_f.nodeValue = vdom.d;
    if (current.e !== vdom.e) _f_n_n_f.__clickData = vdom.e;

    current = vdom;
}
return node;
})
```
