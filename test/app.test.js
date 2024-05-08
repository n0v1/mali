const test = require('ava')
const path = require('path')
const { setTimeout: sleep } = require('timers/promises')
const { finished } = require('stream/promises')
const grpc = require('@grpc/grpc-js')
const hl = require('highland')
const async = require('async')
const _ = require('lodash')
const isCI = require('is-ci')

const Mali = require('../')
const tu = require('./util')

const pl = require('@grpc/proto-loader')

const ARRAY_DATA = [
  { message: '1 foo' },
  { message: '2 bar' },
  { message: '3 asd' },
  { message: '4 qwe' },
  { message: '5 rty' },
  { message: '6 zxc' }
]

function getArrayData () {
  return _.cloneDeep(ARRAY_DATA)
}

test('should set development env when NODE_ENV missing', async t => {
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')
  const NODE_ENV = process.env.NODE_ENV
  process.env.NODE_ENV = ''

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  process.env.NODE_ENV = NODE_ENV
  t.is(app.env, 'development')
})

test('app.inspect should return app properties', async t => {
  const util = require('util')
  const NODE_ENV = process.env.NODE_ENV
  process.env.NODE_ENV = ''
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')
  const app = new Mali(PROTO_PATH, 'Greeter')
  app.foo = 'bar'
  t.truthy(app)
  const str = util.inspect(app)
  process.env.NODE_ENV = NODE_ENV
  t.is('{ ports: [],\n  context: Context {},\n  env: \'development\',\n  name: \'Greeter\',\n  foo: \'bar\' }'.replace(/\s/g, ''), str.replace(/\s/g, ''))
})

test('app.start() with a default port from OS when no params given', async t => {
  t.plan(5)
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start()
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.true(typeof ports[0] === 'number')
  await app.close()
})

test('app.start() should start and not throw with incomplete API', async t => {
  t.plan(5)
  const PROTO_PATH = path.resolve(__dirname, './protos/transform.proto')

  function upper (ctx) {
    ctx.res = { message: ctx.req.message.toUpperCase() }
  }

  const app = new Mali(PROTO_PATH, 'TransformService')
  t.truthy(app)
  app.use({ upper })
  const server = await app.start()
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.true(typeof ports[0] === 'number')
  await app.close()
})

test('app.start() with a default port from OS with object param', async t => {
  t.plan(5)
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start(grpc.ServerCredentials.createInsecure())
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.true(typeof ports[0] === 'number')
  await app.close()
})

test('app.start() with a default port from OS with "127.0.0.1:0"', async t => {
  t.plan(5)
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start('127.0.0.1:0')
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.true(typeof ports[0] === 'number')
  await app.close()
})

test('app.start() with a default port from OS with ""', async t => {
  t.plan(5)
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start('')
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.true(typeof ports[0] === 'number')
  await app.close()
})

test('app.start() with param', async t => {
  t.plan(5)
  const PORT = tu.getPort()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start(`127.0.0.1:0${PORT}`)
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.is(ports[0], PORT)
  await app.close()
})

test('app.start() with port param and invalid creds', async t => {
  t.plan(5)
  const PORT = tu.getPort()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start(`127.0.0.1:0${PORT}`, 'foo')
  t.truthy(server)
  const ports = app.ports
  t.truthy(ports)
  t.is(ports.length, 1)
  t.is(ports[0], PORT)
  await app.close()
})

test('app.start() should throw when binding to taken port', async t => {
  // workround for https://github.com/travis-ci/travis-ci/issues/9918
  if (isCI) {
    t.pass()
    return
  }

  t.plan(3)
  function sayHello (ctx) {
    ctx.res = { message: `Hello ${ctx.req.name}!` }
  }

  const app = new Mali({ file: 'protos/multipkg.proto', root: __dirname })
  const port = tu.getHost()

  app.use({ sayHello })
  const server = await app.start(port)
  t.truthy(server)

  const app2 = new Mali({ file: 'protos/multipkg.proto', root: __dirname })
  app2.use({ sayHello })

  try {
    await app2.start(`0.0.0.0:${app.ports[0]}`)
  } catch (error) {
    console.log(error)
    t.true(error instanceof Error)
    t.is(error.message, 'No address added out of total 1 resolved')
  }
  await app.close()
})

test('should handle req/res request', async t => {
  t.plan(4)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
  const response = await new Promise((resolve, reject) =>
    client.sayHello({ name: 'Bob' }, (err, response) => {
      if (err) {
        return reject(err)
      }
      resolve(response)
    })
  )
  t.truthy(response)
  t.is(response.message, 'Hello Bob')
  await app.close()
})

test('should handle multiple protos request', async t => {
  t.plan(4)
  const APP_HOST = tu.getHost()
  const PROTO_ROOT_FOLDER = path.resolve(__dirname, './protos')
  const PROTO_ROOT_MULTIPLE = path.resolve(__dirname, './protosmultiple')
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali()
  t.truthy(app)
  app.addService({ root: [PROTO_ROOT_MULTIPLE, PROTO_ROOT_FOLDER], file: 'helloworld.proto' }, 'helloworld.Greeter')
  app.use('helloworld.Greeter', 'SayHello', sayHello)
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
  const response = await new Promise((resolve, reject) =>
    client.sayHello({ name: 'Bob' }, (err, response) => {
      if (err) {
        return reject(err)
      }
      resolve(response)
    })
  )
  t.truthy(response)
  t.is(response.message, 'Hello Bob')
  await app.close()
})

test('should handle multiple protos with second folder definitions request', async t => {
  t.plan(4)
  const APP_HOST = tu.getHost()
  const PROTO_ROOT_FOLDER = path.resolve(__dirname, './protos')
  const PROTO_ROOT_MULTIPLE = path.resolve(__dirname, './protosmultiple')
  const PROTO_PATH = path.resolve(__dirname, './protosmultiple/hellomultiple.proto')

  function sayMultiple (ctx) {
    ctx.res = { message: 'Hello Multiple ' + ctx.req.name }
  }

  const app = new Mali()
  t.truthy(app)
  app.addService({ root: [PROTO_ROOT_MULTIPLE, PROTO_ROOT_FOLDER], file: 'hellomultiple.proto' }, 'multiple.hello.GreeterMultiple')
  app.use('multiple.hello.GreeterMultiple', 'SayMultiple', sayMultiple)
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).multiple.hello
  const client = new helloproto.GreeterMultiple(APP_HOST, grpc.credentials.createInsecure())
  const response = await new Promise((resolve, reject) =>
    client.sayMultiple({ name: 'Bob' }, (err, response) => {
      if (err) {
        return reject(err)
      }
      resolve(response)
    })
  )
  t.truthy(response)
  t.is(response.message, 'Hello Multiple Bob')
  await app.close()
})

test('should handle req/res request where res is a promise', async t => {
  t.plan(4)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve({ message: 'Hello ' + ctx.req.name })
      }, 40)
    })
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
  const response = await new Promise((resolve, reject) =>
    client.sayHello({ name: 'Jim' }, (err, response) => {
      if (err) {
        return reject(err)
      }
      resolve(response)
    })
  )
  t.truthy(response)
  t.is(response.message, 'Hello Jim')
  await app.close()
})

test('should handle res stream request', async t => {
  t.plan(3)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/resstream.proto')

  function listStuff (ctx) {
    ctx.res = hl(getArrayData())
      .map(d => {
        d.message = d.message.toUpperCase()
        return d
      })
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  t.truthy(app)
  app.use({ listStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.listStuff({ message: 'Hello' })

  const resData = []
  call.on('data', d => {
    resData.push(d.message)
  })

  await finished(call)

  t.deepEqual(resData, ['1 FOO', '2 BAR', '3 ASD', '4 QWE', '5 RTY', '6 ZXC'])
  await app.close()
})

test('should handle req stream app', async t => {
  t.plan(5)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/reqstream.proto')

  async function doWork (inputStream) {
    return new Promise((resolve, reject) => {
      hl(inputStream)
        .map(d => {
          return d.message.toUpperCase()
        })
        .collect()
        .toCallback((err, r) => {
          if (err) {
            return reject(err)
          }

          resolve({
            message: r.join(':')
          })
        })
    })
  }

  async function writeStuff (ctx) {
    ctx.res = await doWork(ctx.req)
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  t.truthy(app)
  app.use({ writeStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const res = await new Promise(async (resolve, reject) => {
    const call = client.writeStuff((err, response) => {
      if (err) {
        return reject(err)
      }

      resolve(response)
    })

    for await (const d of getArrayData()) {
      await sleep(_.random(10, 50))
      call.write(d)
    }
    call.end()
    await finished(call)
  })

  t.truthy(res)
  t.truthy(res.message)
  t.is(res.message, '1 FOO:2 BAR:3 ASD:4 QWE:5 RTY:6 ZXC')

  await app.close()
})

test('should handle duplex call', async t => {
  t.plan(3)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/duplex.proto')
  async function processStuff (ctx) {
    ctx.req.on('data', d => {
      ctx.req.pause()
      _.delay(() => {
        const ret = {
          message: d.message.toUpperCase()
        }
        ctx.res.write(ret)
        ctx.req.resume()
      }, _.random(50, 150))
    })

    ctx.req.on('end', () => {
      _.delay(() => {
        ctx.res.end()
      }, 200)
    })
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  t.truthy(app)

  app.use({ processStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.processStuff()

  const resData = []
  call.on('data', d => {
    resData.push(d.message)
  })

  for await (const d of getArrayData()) {
    await sleep(_.random(10, 50))
    call.write(d)
  }
  call.end()
  await finished(call)

  t.deepEqual(resData, ['1 FOO', '2 BAR', '3 ASD', '4 QWE', '5 RTY', '6 ZXC'])
  await app.close()
})

test('should start multipe servers from same application and handle requests', async t => {
  t.plan(10)
  const APP_HOST1 = tu.getHost()
  const APP_HOST2 = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)
  app.use({ sayHello })
  const server1 = await app.start(APP_HOST1)
  const server2 = await app.start(APP_HOST2)
  t.truthy(server1)
  t.truthy(server2)
  t.truthy(Array.isArray(app.servers))
  t.is(app.servers.length, 2)
  t.is(app.ports.length, 2)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST1, grpc.credentials.createInsecure())
  const client2 = new helloproto.Greeter(APP_HOST2, grpc.credentials.createInsecure())

  const results = await async.parallel({
    req1: aecb => client.sayHello({ name: 'Bob' }, aecb),
    req2: aecb => client2.sayHello({ name: 'Kate' }, aecb)
  })

  t.truthy(results.req1)
  t.is(results.req1.message, 'Hello Bob')
  t.truthy(results.req2)
  t.is(results.req2.message, 'Hello Kate')

  await app.close()
})

test('should work with multi package proto', async t => {
  t.plan(3)
  function sayHello (ctx) {
    ctx.res = { message: `Hello ${ctx.req.name}!` }
  }

  const app = new Mali({ file: 'protos/multipkg.proto', root: __dirname })
  const port = tu.getHost()

  app.use({ sayHello })
  const server = await app.start(port)
  t.truthy(server)

  const pd = pl.loadSync('protos/multipkg.proto', { includeDirs: [__dirname] })
  const greet = grpc.loadPackageDefinition(pd).greet
  const client = new greet.Greeter(port, grpc.credentials.createInsecure())
  const response = await new Promise((resolve, reject) =>
    client.sayHello({ name: 'Kate' }, (err, response) => {
      if (err) {
        return reject(err)
      }
      resolve(response)
    })
  )
  t.truthy(response)
  t.is(response.message, 'Hello Kate!')
  await app.close()
})
