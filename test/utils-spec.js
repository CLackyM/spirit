import config from '../src/config/config'
import Params from '../src/group/params'
import Timeline from '../src/group/timeline'

import { post } from './fixtures/group/dom'

import {
  context,
  loadscript,
  jsonloader,
  gsap,
  autobind,
  events,
  convert,
  xpath
} from '../src/utils'

import {
  req as jsonloaderReq,
  cache as jsonloaderCache
} from '../src/utils/jsonloader'

const gsapConfig = { ...config.gsap }

describe('utils', () => {

  before(() => {
    sinon.stub(xpath.util, 'isSVG', element => ['SVG', 'G', 'RECT'].includes(element.nodeName))
  })

  after(() => {
    xpath.util.isSVG.restore()
  })

  it('should has window context', () => {
    expect(context.isBrowser()).to.be.ok
  })

  describe('loadscript', () => {

    it('should reject when context is not browser', async() => {
      sinon.stub(context, 'isBrowser').returns(false)

      const err = await resolvePromise(loadscript('anything.js'))
      expect(err).to.be.an('error').match(/can only be loaded in browser/)

      context.isBrowser.restore()
    })

    it('should reject invalid request', async() => {
      const err = await resolvePromise(loadscript('invalid.js'))
      expect(err).to.be.an('error').match(/Could not load/)
    })

    it('should load script into window', async() => {
      expect(window.someGlobal).to.be.undefined
      await loadscript('test/fixtures/loadscript.js')
      expect(window.someGlobal).to.be.a('function')

      delete window.someGlobal // restore
    })

  })

  describe('jsonloader', () => {

    let sandbox

    beforeEach(() => {
      sandbox = sinon.sandbox.create()
      Object.keys(jsonloaderReq).forEach(key => delete jsonloaderReq[key])
      Object.keys(jsonloaderCache).forEach(key => delete jsonloaderCache[key])
    })

    afterEach(() => {
      sandbox.restore()
    })

    it('should reject when context is not browser', async() => {
      sinon.stub(context, 'isBrowser').returns(false)

      const err = await resolvePromise(jsonloader('file.json'))
      expect(err).to.be.an('error').match(/Invalid context/)

      context.isBrowser.restore()
    })

    it('should retrieve from cache', async() => {
      jsonloaderCache['temp.json'] = { foo: 'bar' }
      expect(await jsonloader('temp.json')).to.deep.equal({ foo: 'bar' })
    })

    it('should serve from queued request', async() => {
      jsonloaderReq['temp.json'] = new Promise((resolve) => resolve({ foo: 'bar' }))
      expect(await jsonloader('temp.json')).to.deep.equal({ foo: 'bar' })
    })

    it('should reject as invalid request', async() => {
      stubXhr(sandbox, {
        open: () => {
          throw new Error('Invalid')
        }
      })

      const err = await resolvePromise(jsonloader('invalid-file.js'))
      expect(err).to.be.an('error').match(/Could not open request/)
    })

    it('should resolve json', async() => {
      stubXhr(sandbox, { responseText: `{"foo": "bar"}` })
      expect(await jsonloader('test.json')).to.deep.equal({ foo: 'bar' })
    })

    it('should reject invalid json', async() => {
      stubXhr(sandbox, { responseText: `{foo": "bar"}` })

      const err = await resolvePromise(jsonloader('invalid-json.json'))
      expect(err).to.be.an('error').match(/Invalid json/)
    })

  })

  describe('gsap', () => {

    beforeEach(() => {
      config.gsap = { ...gsapConfig }
    })

    afterEach(() => {
      config.gsap = { ...gsapConfig }
    })

    describe('ensure', () => {

      it('should not contain any gsap', () => {
        expect(gsap.has()).to.be.false
      })

      it('should ensure gsap', async() => {
        config.gsap.autoInjectUrl = 'test/fixtures/gsap.js'

        expect(gsap.has()).to.be.false

        await gsap.ensure()

        expect(window.TweenMax).to.be.a('function')
        expect(window.TimelineMax).to.be.a('function')
        expect(gsap.has()).to.be.true
      })

      it('should resolve if already has gsap', async() => {
        config.gsap.tween = function() {}
        config.gsap.timeline = function() {}
        await gsap.ensure()
        expect(gsap.has()).to.be.true
      })

      it('should reject ensure() when autoInject is false', async() => {
        config.gsap.autoInject = false

        const err = await resolvePromise(gsap.ensure())
        expect(err).to.be.an('error').match(/GSAP not found/)
      })

    })

    describe('construct tween object from params', () => {

      it('should create tween object from Params instance', () => {
        const constructed = gsap.constructTweenParams(new Params({ x: 100, y: 200 }))
        expect(constructed).to.deep.equal({ x: 100, y: 200 })
      })

      it('should create tween object from an object', () => {
        const constructed = gsap.constructTweenParams({ x: 100, y: 200 })
        expect(constructed).to.deep.equal({ x: 100, y: 200 })
      })

      it('should create tween object with modified values', () => {
        const constructed = gsap.constructTweenParams({ x: 100, y: 200, rotateZ: 400 })
        expect(constructed).to.deep.equal({ x: 100, y: 200, rotationZ: '+=400deg' })
      })

    })

    describe('generate timeline', () => {

      const div = document.createElement('div')

      it('should fail on invalid data', () => {
        expect(() => gsap.generateTimeline()).to.throw(/Need valid timeline/)
        expect(() => gsap.generateTimeline([])).to.throw(/Need valid timeline/)
        expect(() => gsap.generateTimeline({})).to.throw(/Need valid timeline/)
      })

      it('should fail if gsap timeline is not set', () => {
        expect(() => gsap.generateTimeline(new Timeline('dom', div, [], 'div[0]'))).to.throw(/GSAP not set/)
      })

      it('should fail if provided timeline is not of type "dom"', () => {
        config.gsap.timeline = function() {}
        expect(() => gsap.generateTimeline(new Timeline('object', {})))
          .to.throw(/Timeline invalid. Needs a timeline with type of dom/)
      })

      describe('on generated', () => {

        let timeline

        beforeEach(async() => {
          config.gsap.autoInjectUrl = 'test/fixtures/gsap.js'
          await gsap.ensure()

          timeline = gsap.generateTimeline(
            new Timeline('dom', div, [
              { frame: 0, params: { x: 100, y: 100, rotateX: 300 } },
              { frame: 100, params: { rotateX: 500 } },
              { frame: 200, params: { x: 1000 } }
            ], 'div[0]')
          )
        })

        it('should have _gsTransform and _gsTweenID added to div', () => {
          expect(div._gsTransform).to.be.an('object')
          expect(div._gsTweenID).to.be.an('string')
        })

        it('should have a gsap timeline with correct duration', () => {
          expect(timeline).to.be.an.instanceOf(config.gsap.timeline)
          expect(timeline.duration()).to.equal(200)
        })

        it('should use frames and is paused', () => {
          expect(timeline.vars).to.deep.equal({ useFrames: true, paused: true })
          expect(timeline.usesFrames()).to.be.true
        })

        describe('children', () => {

          it('should have children', () => {
            expect(timeline.getChildren()).to.have.lengthOf(3)
          })

          it('should have parent timeline', () => {
            const children = timeline.getChildren()
            children.forEach(child => expect(child.timeline).to.equal(timeline))
          })

          it('should have correct transitions', () => {
            const children = timeline.getChildren()
            expect(children[0].vars).to.deep.equal({
              css: { x: 100, y: 100, rotationX: '+=300deg' },
              ease: 'Linear.easeNone'
            })
            expect(children[1].vars).to.deep.equal({ rotationX: '+=500deg', ease: 'Linear.easeNone' })
            expect(children[2].vars).to.deep.equal({ x: 1000, ease: 'Linear.easeNone' })
          })

          it('should have the correct offset', () => {
            const children = timeline.getChildren()
            expect(children[0].startTime()).to.equal(0)
            expect(children[1].startTime()).to.equal(0)
            expect(children[2].startTime()).to.equal(100)
          })

        })

      })

    })

  })

  describe('autobind', () => {

    class A {
      exec() { this.fn.call(this) }
    }

    it('should not autobind method', () => {
      class B {
        constructor() {
          let a = new A()
          a.fn = this.executed
          a.exec()
        }

        executed() {
          expect(this).to.be.instanceOf(A)
        }
      }

      new B()
    })

    it('should autobind method', () => {
      class B {
        constructor() {
          let a = new A()
          a.fn = this.executed
          a.exec()
        }

        @autobind
        executed() {
          expect(this).to.be.instanceOf(B)
        }
      }

      new B()
    })

    it('should not autobind class', () => {
      class B {
        constructor() {
          let a = new A()
          a.fn = this.executed
          a.exec()
        }

        executed() {
          expect(this).to.be.instanceOf(A)
        }
      }

      new B()
    })

    it('should autobind class', () => {
      @autobind
      class B {
        constructor() {
          let a = new A()
          a.fn = this.executed
          a.exec()
        }

        executed() {
          expect(this).to.be.instanceOf(B)
        }
      }

      new B()
    })

  })

  describe('events', () => {

    describe('bubbleEvent', () => {

      it('should fail when setting invalid scope', () => {
        expect(() => events.bubbleEvent('change', {})).to.throw(/Scope needs to be an event emitter./)
      })

      it('should bubble event', () => {
        class MyEmitter extends require('events').EventEmitter {}
        const spy = sinon.spy()
        const myEmitter = new MyEmitter()
        myEmitter.on('update', spy)

        const fn = events.bubbleEvent('update', myEmitter)
        const arg = { a: 200 }

        fn(arg)

        expect(spy.withArgs(arg).calledOnce).to.be.true
      })
    })

    describe('create event object for model', () => {

      class Model {
        frame = 0

        constructor(obj = {}) {
          Object.assign(this, obj)
        }
      }
      Model.fromObject = (obj) => new Model(obj)

      it('should create a valid event object for model', () => {
        const m = new Model()
        const evtObj = events.createEventObjectForModel(Model, m, 'frame', 0, 1)

        expect(evtObj).to.deep.equal({
          prevModel: { frame: 0 },
          model: { frame: 1 },
          changed: { type: 'frame', from: 0, to: 1 }
        })
      })

    })

    describe('clear events', () => {

      it('should clear all events for modern node implementations', () => {
        class MyEmitter extends require('events').EventEmitter {
          eventNames() {
            return ['foo', 'bar']
          }
        }

        const spyFoo = sinon.spy()
        const spyBar = sinon.spy()

        const emitter = new MyEmitter()
        emitter.on('foo', spyFoo)
        emitter.on('bar', spyBar)

        emitter.emit('foo')
        emitter.emit('bar')

        expect(spyFoo.calledOnce).to.be.true
        expect(spyBar.calledOnce).to.be.true

        events.clearEvents(emitter)

        emitter.emit('foo')
        emitter.emit('bar')

        expect(spyFoo.calledOnce).to.be.true
        expect(spyBar.calledOnce).to.be.true
      })

      it('should clear all events for legacy node implementations', () => {
        class MyEmitter extends require('events').EventEmitter {}

        const spyFoo = sinon.spy()
        const spyBar = sinon.spy()

        const emitter = new MyEmitter()
        emitter.on('foo', spyFoo)
        emitter.on('bar', spyBar)

        emitter.emit('foo')
        emitter.emit('bar')

        expect(spyFoo.calledOnce).to.be.true
        expect(spyBar.calledOnce).to.be.true

        events.clearEvents(emitter, ['foo', 'bar'])

        emitter.emit('foo')
        emitter.emit('bar')

        expect(spyFoo.calledOnce).to.be.true
        expect(spyBar.calledOnce).to.be.true
      })

    })

  })

  describe('convert', () => {

    it('should convert object to array', () => {
      expect(convert.objectToArray({ a: 'a', b: 'b', c: 'c' })).to.deep.equal([
        { a: 'a' },
        { b: 'b' },
        { c: 'c' }
      ])
    })

    it('should convert array to object', () => {
      expect(convert.arrayToObject([{ a: 'a' }, { b: 'b' }, { c: 'c' }])).to.deep.equal({
        a: 'a',
        b: 'b',
        c: 'c'
      })
    })

  })

  describe('xpath', () => {

    let container,
        post1,
        post2

    beforeEach(() => {
      container = document.createElement('div')
      container.setAttribute('id', 'container')
      document.body.appendChild(container)

      post1 = post()
      post2 = post()

      container.appendChild(post1)
      container.appendChild(post2)
    })

    afterEach(() => {
      document.body.removeChild(container)
    })

    describe('get expression', () => {

      it('should get xpath string relative to html', () => {
        const a = xpath.getExpression(post2.querySelector('.post-date'))
        const b = xpath.getExpression(post2.querySelector('.post-args'))

        expect(a).to.equal('/html[1]/body[1]/div[1]/div[2]/div[1]/div[1]/span[1]')
        expect(b).to.equal('/html[1]/body[1]/div[1]/div[2]/div[1]/div[1]/span[2]')
      })

      it('should get xpath relative to parent element', () => {
        const a = xpath.getExpression(post2.querySelector('.post-date'), container)
        const b = xpath.getExpression(post2.querySelector('.post-args'), container)

        expect(a).to.equal('div[2]/div[1]/div[1]/span[1]')
        expect(b).to.equal('div[2]/div[1]/div[1]/span[2]')
      })

      it('should get null', () => {
        expect(xpath.getExpression('div[3]', container)).to.equal(null)
        expect(xpath.getExpression('div[3]/div[2]/span[1]', container)).to.equal(null)
      })

      describe('svg', () => {
        let svg

        beforeEach(() => {
          // add svg element with nested rect
          svg = document.createElement('svg')

          let g    = document.createElement('g'),
              rect = document.createElement('rect')

          g.appendChild(rect)
          svg.appendChild(g)
          container.querySelector('.entry').appendChild(svg)
        })

        it('should get xpath string relative to html', () => {
          expect(xpath.getExpression(svg.querySelector('rect'))).to.equal(
            `/html[1]/body[1]/div[1]/div[1]/div[1]/*[local-name()='svg'][1]/*[local-name()='g'][1]/*[local-name()='rect'][1]`
          )
        })

        it('should get xpath relative to parent element', () => {
          expect(xpath.getExpression(svg.querySelector('rect'), container)).to.equal(
            `div[1]/div[1]/*[local-name()='svg'][1]/*[local-name()='g'][1]/*[local-name()='rect'][1]`
          )
        })
      })

    })

    describe('get element', () => {

      it('should get element by expression from html', () => {
        const element = xpath.getElement('/html[1]/body[1]/div[1]/div[2]/div[1]/div[1]/span[1]')
        expect(element).to.equal(post2.querySelector('.post-date'))
      })

      it('should get element by expression relative to parent element', () => {
        const element = xpath.getElement('div[1]/div[1]/div[1]/span[2]', container)
        expect(element).to.equal(post1.querySelector('.post-args'))
      })

    })

  })

})
