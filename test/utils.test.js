const test = require('ava')
const path = require('path')
const { finished } = require('stream/promises')
const grpc = require('@grpc/grpc-js')
const CallType = require('@malijs/call-types')
const hl = require('highland')
const _ = require('lodash')
const async = require('async')

const tu = require('./util')
const Mali = require('../')
const utils = require('../lib/utils')

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

test('getCallTypeFromDescriptor() should get call type from UNARY call', async t => {
  const desc = {
    requestStream: false,
    responseStream: false,
    requestName: 'Point',
    responseName: 'Feature',
    name: 'GetFeature',
    service: 'RouteGuide',
    package: 'routeguide',
    fullName: '/routeguide.RouteGuide/GetFeature'
  }

  const v = utils.getCallTypeFromDescriptor(desc)
  t.is(v, CallType.UNARY)
})

test('getCallTypeFromDescriptor() should get call type from REQUEST_STREAM call', async t => {
  const desc = {
    requestStream: true,
    responseStream: false,
    requestName: 'Point',
    responseName: 'RouteSummary',
    name: 'RecordRoute',
    service: 'RouteGuide',
    package: 'routeguide',
    fullName: '/routeguide.RouteGuide/RecordRoute'
  }

  const v = utils.getCallTypeFromDescriptor(desc)
  t.is(v, CallType.REQUEST_STREAM)
})

test('getCallTypeFromDescriptor() should get call type from RESPONSE_STREAM call', async t => {
  const desc = {
    requestStream: false,
    responseStream: true,
    requestName: 'Rectangle',
    responseName: 'Feature',
    name: 'ListFeatures',
    service: 'RouteGuide',
    package: 'routeguide',
    fullName: '/routeguide.RouteGuide/ListFeatures'
  }

  const v = utils.getCallTypeFromDescriptor(desc)
  t.is(v, CallType.RESPONSE_STREAM)
})

test('getCallTypeFromDescriptor() should get call type from DUPLEX call', async t => {
  const desc = {
    requestStream: true,
    responseStream: true,
    requestName: 'RouteNote',
    responseName: 'RouteNote',
    name: 'RouteChat',
    service: 'RouteGuide',
    package: 'routeguide',
    fullName: '/routeguide.RouteGuide/RouteChat'
  }

  const v = utils.getCallTypeFromDescriptor(desc)
  t.is(v, CallType.DUPLEX)
})

test('getCallTypeFromCall() should get call type from UNARY call', async t => {
  t.plan(1)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/helloworld.proto')

  let callType

  function sayHello (ctx) {
    callType = utils.getCallTypeFromCall(ctx.call)
    ctx.res = { message: 'Hello ' + ctx.req.name }
  }

  const app = new Mali(PROTO_PATH, 'Greeter')
  app.use({ sayHello })
  await app.start(APP_HOST)
  const pd = pl.loadSync(PROTO_PATH)
  const helloproto = grpc.loadPackageDefinition(pd).helloworld
  const client = new helloproto.Greeter(APP_HOST, grpc.credentials.createInsecure())
  await new Promise((resolve, reject) => {
    client.sayHello({ name: 'Bob' }, (err, response) => {
      if (err) {
        return reject(err)
      }

      resolve(response)
    })
  })
  t.is(callType, CallType.UNARY)

  await app.close()
})

test('getCallTypeFromCall() should get call type from RESPONSE_STREAM call', async t => {
  t.plan(1)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/resstream.proto')

  let callType

  function listStuff (ctx) {
    callType = utils.getCallTypeFromCall(ctx.call)
    ctx.res = hl(getArrayData())
      .map(d => {
        d.message = d.message.toUpperCase()
        return d
      })
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use({ listStuff })
  await app.start(APP_HOST)
  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.listStuff({ message: 'Hello' })

  const resData = []
  call.on('data', d => {
    resData.push(d.message)
  })

  await finished(call)

  t.is(callType, CallType.RESPONSE_STREAM)

  await app.close()
})

test('getCallTypeFromCall() should get call type from REQUEST_STREAM call', async t => {
  t.plan(1)
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

  let callType
  async function writeStuff (ctx) {
    callType = utils.getCallTypeFromCall(ctx.call)
    ctx.res = await doWork(ctx.req)
  }

  const app = new Mali(PROTO_PATH, 'ArgService')
  app.use({ writeStuff })
  await app.start(APP_HOST)
  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  let call
  await new Promise((resolve, reject) => {
    call = client.writeStuff((err, response) => {
      if (err) {
        return reject(err)
      }

      resolve(response)
    })

    async.eachSeries(getArrayData(), (d, asfn) => {
      call.write(d)
      _.delay(asfn, _.random(10, 50))
    }, () => {
      call.end()
    })
  })

  await finished(call)

  t.is(callType, CallType.REQUEST_STREAM)

  await app.close()
})

test('getCallTypeFromCall() should get call type from DUPLEX call', async t => {
  t.plan(1)
  const APP_HOST = tu.getHost()
  const PROTO_PATH = path.resolve(__dirname, './protos/duplex.proto')

  let callType
  async function processStuff (ctx) {
    callType = utils.getCallTypeFromCall(ctx.call)
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
  app.use({ processStuff })
  await app.start(APP_HOST)
  const pd = pl.loadSync(PROTO_PATH)
  const proto = grpc.loadPackageDefinition(pd).argservice
  const client = new proto.ArgService(APP_HOST, grpc.credentials.createInsecure())
  const call = client.processStuff()

  const resData = []
  call.on('data', d => {
    resData.push(d.message)
  })

  async.eachSeries(getArrayData(), (d, asfn) => {
    call.write(d)
    _.delay(asfn, _.random(10, 50))
  }, () => {
    call.end()
  })

  await finished(call)

  t.is(callType, CallType.DUPLEX)

  await app.close()
})

test('getPackageNameFromPath() should get the package name', async t => {
  const testData = [{
    input: '/helloworld.Greeter/SayHello',
    expected: 'helloworld'
  }, {
    input: '/Greeter/SayHello',
    expected: ''
  }]

  testData.forEach(td => {
    const { input, expected } = td
    const actual = utils.getPackageNameFromPath(input)
    t.is(actual, expected)
  })
})

test('getShortServiceNameFromPath() should get the short service name name', async t => {
  const testData = [{
    input: '/helloworld.Greeter/SayHello',
    expected: 'Greeter'
  }, {
    input: '/Greeter/SayHello',
    expected: 'Greeter'
  }]

  testData.forEach(td => {
    const { input, expected } = td
    const actual = utils.getShortServiceNameFromPath(input)
    t.is(actual, expected)
  })
})
