
  import {customDirectives, domc} from './index.js'

/**** conditional rendering directive "v-if" ****/

  function setup(initialNode, Directive) {
    if ((Directive == null) || (Directive.trim() === '')) {
      Directive = '() => true'
    }

    const IdentifierPattern = /^\s*([_$a-z][_$a-z0-9]*)\s*$/i
    const FunctionPattern   = /^\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*=>\s*([\s\S]+)$/i

    let Match
      Match = IdentifierPattern.exec(Directive)
      if (Match != null) {
        Match = [null, Match[1], `{ return (${Match[1]} == true) }`]
      } else {
        Match = FunctionPattern.exec(Directive)
        if (Match == null) throw new Error(
          'domc: invalid "v-if" condition given'
        )
      }
    let [_,Parameters,Body] = Match
      Parameters = (Parameters || '').trim().replace(/\s*,\s*/g,',').split(',')
      if (Parameters[0] === '') { Parameters = [] }

      Body = Body.trim()
      switch (true) {
        case (Body === ''):
          Body = 'return true'
          break
        case Body.startsWith('{'):
          Body = Body.slice(1).replace(/\}\s*$/,'').trim()
          break
        default:
          Body = 'return ' + Body
      }
    let Predicate
      try {
        Predicate = new Function(Parameters.join(','),Body)
      } catch (Signal) {
        throw new Error(
          'domc: could not compile "v-if" condition, reason: ' + Signal
        )
      }
    const Template     = domc(initialNode)
    let   renderedNode = initialNode
    let   isVisible    = false

    function update (Scope) {
      let shouldBeVisible
        try {
          let ArgumentList = Parameters.map((Parameter) => Scope[Parameter])
          shouldBeVisible = (Predicate.apply(Scope,ArgumentList) === true)
        } catch (Signal) {
          throw new Error(
            'domc: could not evaluate "v-if" condition, reason: ' + Signal
          )
        }
      if (shouldBeVisible) {
        let localScope = Object.assign({},Scope)
        if (isVisible) {
          renderedNode.update(localScope)
        } else {
          renderedNode.replaceWith(
            renderedNode = Template.createInstance(localScope)
          )
        }
      } else {
        if (isVisible) {
          renderedNode.replaceWith(
            renderedNode = document.createElement('div')
          )
          renderedNode.style.display = 'none'
        }
      }
      isVisible = shouldBeVisible
    }
    return update
  }
  customDirectives.if = setup
