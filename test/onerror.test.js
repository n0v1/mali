const test = require('ava')
const { AssertionError } = require('assert')
const { stderr } = require('test-console')
const path = require('path')
const grpc = require('@grpc/grpc-js')

const Mali = require('../')
const tu = require('./util')

const pl = require('@grpc/proto-loader')

test('should throw an error if a non-error is given', t => {
  const app = new Mali()
  t.truthy(app)

  const error = t.throws(() => {
    app.onerror('foo')
  }, { instanceOf: AssertionError })

  t.is(error.message, 'non-error thrown: foo')
})

test('should do nothing if .silent', t => {
  const app = new Mali()
  t.truthy(app)
  app.silent = true

  const err = new Error()
  const output = stderr.inspectSync(() => app.onerror(err))

  t.deepEqual(output, [])
})

test('should log the error to stderr', t => {
  const app = new Mali()
  t.truthy(app)
  app.env = 'dev'

  const err = new Error()
  err.stack = 'Foo'

  const output = stderr.inspectSync(() => app.onerror(err))

  t.deepEqual(output, ['\n', '  Foo\n', '\n'])
})

test('should use err.toString() instad of err.stack', t => {
  const app = new Mali()
  t.truthy(app)
  app.env = 'dev'

  const err = new Error('mock stack null')
  err.stack = null

  const output = stderr.inspectSync(() => app.onerror(err))

  t.deepEqual(output, ['\n', '  Error: mock stack null\n', '\n'])
})

test('should log an error in the handler in req/res app', async t => {
  t.plan(6)
  const APP_HOST = await tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    throw new Error('boom')
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
  const inspect = stderr.inspect()
  let error
  try {
    await new Promise((resolve, reject) => {
      client.sayHello({ name: 'Bob' }, (err, response) => {
        if (err) {
          return reject(err)
        }

        resolve(response)
      })
    })
  } catch (err) {
    error = err
  }
  t.truthy(error)
  t.true(error.message.indexOf('boom') >= 0)
  inspect.restore()
  const output = Array.isArray(inspect.output) ? inspect.output.join() : inspect.output
  t.true(output.indexOf('Error: boom') > 0)
  t.true(output.indexOf('at sayHello') > 0)

  await app.close()
})
