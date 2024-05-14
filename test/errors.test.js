const test = require('ava')
const path = require('path')
const { finished } = require('stream/promises')
const grpc = require('@grpc/grpc-js')
const hl = require('highland')
const async = require('async')
const _ = require('lodash')

const Mali = require('../')
const tu = require('./util')

const pl = require('@grpc/proto-loader')
const CallType = require('@malijs/call-types')

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

function crashMapper (d) {
  if (d.message.indexOf(3) >= 0) {
    // cause a crash
    let str = JSON.stringify(d)
    str = str.concat('asdf')
    const no = JSON.parse(str)
    return no
  } else {
    d.message = d.message.toUpperCase()

    return d
  }
}

test('should handle an error in the handler in req/res app', async t => {
  t.plan(10)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    throw new Error('boom')
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)

  let errMsg
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg = err.message
  })

  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
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
  t.is(errMsg, 'boom')
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'SayHello')
  t.is(errCtx.type, CallType.UNARY)

  await app.close()
})

test('should handle an error in the handler in req/res app where ctx.res is a promise that rejects', async t => {
  t.plan(10)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('boom'))
      }, 100)
    })
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)

  let errMsg
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg = err.message
  })

  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
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
  t.is(errMsg, 'boom')
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'SayHello')
  t.is(errCtx.type, CallType.UNARY)

  await app.close()
})

test('should return error when we set response to error explicitely', async t => {
  t.plan(5)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    ctx.res = new Error('boom')
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)

  let errCtx
  app.on('error', (_err, ctx) => {
    errCtx = ctx
  })

  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
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
  t.falsy(errCtx)

  await app.close()
})

test('should handle an error with code in the handler in req/res app', async t => {
  t.plan(12)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    // if we set code message gets overwritten with details in seems
    const err = new Error('crash')
    err.code = grpc.status.INVALID_ARGUMENT
    err.details = 'details'
    throw err
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)

  let errMsg
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg = err.message
  })

  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
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
  t.true(error.message.indexOf('details') >= 0)
  t.is(error.code, grpc.status.INVALID_ARGUMENT)
  t.is(errMsg, 'crash')
  t.is(error.details, 'details')
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'SayHello')
  t.is(errCtx.type, CallType.UNARY)

  await app.close()
})

test('should handle an error without code and with details in the handler in req/res app', async t => {
  t.plan(12)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    const err = new Error('crash')
    // in this case details are overwritten
    err.details = 'details'
    throw err
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)

  let errMsg
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg = err.message
  })

  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
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
  t.true(error.message.indexOf('crash') >= 0)
  t.is(error.code, grpc.status.UNKNOWN)
  t.is(errMsg, 'crash')
  t.is(error.details, 'crash')
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'SayHello')
  t.is(errCtx.type, CallType.UNARY)

  await app.close()
})

test('should handle custom error in the handler in req/res app', async t => {
  class MyCustomError extends Error {
    constructor (message, code) {
      super(message)
      this.code = code
    }
  }

  t.plan(11)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  function sayHello (ctx) {
    throw new MyCustomError('burn', grpc.status.FAILED_PRECONDITION)
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  t.truthy(app)

  let errMsg
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg = err.message
  })

  app.use({ sayHello })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
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
  t.true(error.message.indexOf('burn') >= 0)
  t.is(error.code, grpc.status.FAILED_PRECONDITION)
  t.is(errMsg, 'burn')
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'SayHello')
  t.is(errCtx.type, CallType.UNARY)

  await app.close()
})

test('should handle an error in the handler in res stream app', async t => {
  t.plan(13)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/resstream.proto')

  // TODO fix this so it works with newer Beta's of Highland
  function listStuff (ctx) {
    const s = hl(getArrayData())
      .map(crashMapper)

    ctx.res = s
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  t.truthy(app)

  let errMsg1
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg1 = err ? err.message : ''
  })

  app.use({ listStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.listStuff({ message: 'Hello' })

  let dataCounter = 0
  call.on('data', msg => {
    dataCounter++
  })

  let endCalled = false
  let errMsg2
  call.on('error', err => {
    errMsg2 = err ? err.message : ''
    if (!endCalled) {
      endCalled = true
    }
  })

  call.on('end', () => {
    if (!endCalled) {
      endCalled = true
    }
  })

  await finished(call, { error: false })

  t.true(dataCounter >= 1)
  t.truthy(errMsg1)
  t.truthy(errMsg2)
  t.true(endCalled)
  t.true(errMsg1.indexOf('Unexpected token') >= 0)
  t.true(errMsg2.indexOf('Unexpected token') >= 0)
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'ListStuff')
  t.is(errCtx.type, CallType.RESPONSE_STREAM)

  await app.close()
})

test('should handle an error in the handler in req stream app', async t => {
  t.plan(11)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/reqstream.proto')

  async function writeStuff (ctx) {
    return new Promise((resolve, reject) => {
      hl(ctx.req)
        .map(crashMapper)
        .collect()
        .toCallback((err, r) => {
          if (err) {
            return reject(err)
          }

          ctx.res = {
            message: r.length.toString()
          }
          resolve()
        })
    })
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  t.truthy(app)

  let errMsg1
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg1 = err ? err.message : ''
  })

  app.use({ writeStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)

  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  let call
  let error
  try {
    await new Promise((resolve, reject) => {
      call = client.writeStuff((err, res) => {
        if (err) {
          return reject(err)
        }

        resolve(res)
      })

      let w = true
      const ended = false

      call.on('error', () => {
        w = false
      })

      call.on('close', () => {
        w = false
      })

      call.on('finish', () => {
        w = false
      })

      async.eachSeries(getArrayData(), (d, asfn) => {
        if (w) {
          call.write(d)
        }
        _.delay(asfn, _.random(10, 50))
      }, () => {
        if (!ended) {
          call.end()
        }
      })
    })
  } catch (err) {
    error = err
  }

  await finished(call, { error: false })

  t.truthy(error)
  t.truthy(error.message)
  t.true(errMsg1.indexOf('Unexpected token') >= 0)
  t.true(error.message.indexOf('Unexpected token') >= 0)
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'WriteStuff')
  t.is(errCtx.type, CallType.REQUEST_STREAM)

  await app.close()
})

test('should handle error in response stream', async t => {
  t.plan(8)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/resstream.proto')

  const data = ['a', 'b', 'c', 'ERROR', 'd']
  function listStuff (ctx) {
    const s = hl(data)
      .consume((e_, d, push, next) => {
        setTimeout(() => {
          if (d === 'ERROR') {
            push(new Error('stream error'))
            next()
          } else {
            push(null, { message: d })
            next()
          }
        }, 10)
      })

    ctx.res = s
  }
  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use({ listStuff })
  const appErrorPromise = new Promise(resolve => {
    app.on('error', err => {
      resolve(err)
    })
  })
  await app.start(APP_HOST)

  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.listStuff({ message: 'Hello' })
  const callErrorPromise = new Promise(resolve => {
    call.on('error', err => {
      resolve(err)
    })
  })

  let endCalled = false
  let errCalled = false
  let err = null
  const resData = []
  call.on('data', d => {
    resData.push(d)
  })
  call.on('end', () => {
    endCalled = true
  })
  call.on('error', e => {
    err = e
    errCalled = true
  })

  const msg1 = (await appErrorPromise).message
  const msg2 = (await callErrorPromise).message
  t.true(msg1.indexOf('stream error') >= 0)
  t.true(msg2.indexOf('stream error') >= 0)
  t.is(resData.length, 3)
  t.deepEqual(resData, [{ message: 'a' }, { message: 'b' }, { message: 'c' }])
  t.true(endCalled)
  t.true(errCalled)
  t.truthy(err)
  t.true(err.message.indexOf('stream error') >= 0)
})

test('should handle an error in the handler of duplex call', async t => {
  t.plan(13)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/duplex.proto')
  async function processStuff (ctx) {
    ctx.req.on('data', d => {
      ctx.req.pause()
      _.delay(() => {
        let ret = {}
        try {
          ret = crashMapper(d)
        } catch (e) {
          ctx.res.emit('error', e)
          return
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

  let errMsg1 = ''
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg1 = err ? err.message : ''
  })

  app.use({ processStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)
  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.processStuff()

  let dataCounter = 0
  call.on('data', d => {
    dataCounter++
  })

  let errMsg2 = ''
  let endCalled = false
  call.on('error', err2 => {
    errMsg2 = err2 ? err2.message : ''
    if (!endCalled) {
      endCalled = true
    }
  })

  call.on('end', () => {
    if (!endCalled) {
      endCalled = true
    }
  })

  async.eachSeries(getArrayData(), (d, asfn) => {
    call.write(d)
    _.delay(asfn, _.random(10, 50))
  }, () => {
    call.end()
  })

  await finished(call, { error: false })

  t.is(dataCounter, 2)
  t.truthy(errMsg1)
  t.truthy(errMsg2)
  t.true(endCalled)
  t.true(errMsg1.indexOf('Unexpected token') >= 0)
  t.true(errMsg2.indexOf('Unexpected token') >= 0)
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'ProcessStuff')
  t.is(errCtx.type, CallType.DUPLEX)
  await app.close()
})

test('should handle an error in the handler of duplex call that returns a promise', async t => {
  t.plan(13)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/duplex.proto')
  async function processStuff (ctx) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        ctx.req.on('data', d => {
          ctx.req.pause()
          _.delay(() => {
            let ret = {}
            try {
              ret = crashMapper(d)
            } catch (e) {
              return reject(e)
            }
            ctx.res.write(ret)
            ctx.req.resume()
          }, _.random(50, 150))
        })

        ctx.req.on('end', () => {
          _.delay(() => {
            ctx.res.end()
            resolve()
          }, 200)
        })
      }, 100)
    })
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  t.truthy(app)

  let errMsg1 = ''
  let errCtx
  app.on('error', (err, ctx) => {
    errCtx = ctx
    errMsg1 = err ? err.message : ''
  })

  app.use({ processStuff })
  const server = await app.start(APP_HOST)
  t.truthy(server)
  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.processStuff()

  let dataCounter = 0
  call.on('data', d => {
    dataCounter++
  })

  let errMsg2 = ''
  call.on('error', err2 => {
    errMsg2 = err2 ? err2.message : ''
    if (!endCalled) {
      endCalled = true
    }
  })

  let endCalled = false
  call.on('end', () => {
    if (!endCalled) {
      endCalled = true
    }
  })

  async.eachSeries(getArrayData(), (d, asfn) => {
    call.write(d)
    _.delay(asfn, _.random(10, 50))
  }, () => {
    call.end()
  })

  await finished(call, { error: false })

  t.is(dataCounter, 2)
  t.truthy(errMsg1)
  t.truthy(errMsg2)
  t.true(endCalled)
  t.true(errMsg1.indexOf('Unexpected token') >= 0)
  t.true(errMsg2.indexOf('Unexpected token') >= 0)
  t.truthy(errCtx)
  t.truthy(errCtx.call)
  t.truthy(errCtx.req)
  t.is(errCtx.name, 'ProcessStuff')
  t.is(errCtx.type, CallType.DUPLEX)

  await app.close()
})
