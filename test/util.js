async function getPort () {
  // get-port needs to be imported asynchronously because it's a pure ESM module
  // see https://github.com/tc39/proposal-dynamic-import
  const { default: getRandomPort } = await import('get-port')

  const randomPort = await getRandomPort()
  return randomPort
}

async function getHostport (port) {
  return '0.0.0.0:'.concat(port || await getPort())
}

exports.getHost = getHostport
exports.getPort = getPort
