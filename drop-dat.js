import hyperdrive from 'hyperdrive'
import swarm from 'hyperdiscovery'
import ram from 'random-access-memory'
import minimist from 'minimist'
import pump from 'pump'
import hyperdriveHttp from 'hyperdrive-http'
import websocket from 'websocket-stream'
import { readFile } from 'fs'
import { resolve } from 'path'
import { M, E, F } from 'promisey'
import { createServer } from 'http'

const DEFAULT_PORT = parseInt(process.env.PORT || '0') || 8040

main(minimist(process.argv.slice(2))).catch(err => {
  console.error(err.stack)
  return process.exit(1)
})

async function main (argv) {
  // Run a server if the `--serve` option is given
  if (argv.serve) return serve(argv.serve === true ? DEFAULT_PORT : argv.serve)

  if (!argv._.length) {
    console.error('Usage: drop-dat files...')
    return process.exit(2)
  }

  // Create a new in-memory hyperdrive
  let archive = hyperdrive(name => ram())

  // Wait for it to be ready
  await E(archive, 'ready')

  // Add some files to it.
  console.error('Importing file(s)...')
  for (let name of argv._) {
    let fullPath = resolve(process.cwd(), name)
    console.error(`Adding ${fullPath}...`)
    await M(archive, 'writeFile', name, await F(readFile, fullPath))
  }

  console.error('Uploading to server')
  if (argv.upload) return upload(archive, argv.upload)
  console.error('Sharing on P2P network')
  return share(archive)
}

async function share (archive) {
  var sw = swarm(archive)
  sw.on('connection', (peer, type) => {
    console.error('Found swarm peer.')
  })
  console.error('Sharing on dat P2P network...')
  console.error('Press Control+C to stop sharing.\n')
  console.log(`dat://${archive.key.toString('hex')}`)

  // Keep the event loop alive forever.
  process.stdin.resume()
}

async function upload (archive, url) {
  if (url === true) url = 'localhost'
  if (typeof url === 'number') url = 'localhost:' + url
  let [host, port = DEFAULT_PORT] = url.split(':')
  let socket = websocket(`ws://${host}:${port}/`)
  await E(socket, 'connect')
  console.error('Connected to Server, uploading...')
  await M(socket, 'write', archive.key)
  console.log(`http://${host}:${port}/${archive.key.toString('hex')}/`)
  archive.content.on('upload', index => {
    console.log('Upload', index)
  })
  await F(pump, socket, archive.replicate({ upload: true, live: true }), socket)
}

async function serve (port) {
  let sites = {}

  let server = createServer((req, res) => {
    // See if the request matches
    let match = req.url.match(/\/([0-9a-f]{64})\//)
    let site = match && sites[match[1]]
    if (!site) return res.writeHead(404)
    req.url = req.url.replace(match[0], '/')
    return site(req, res)
  }).listen(port)

  websocket.createServer({server}, stream => {
    handleClient(stream).catch(err => {
      console.error(err.stack)
    })
  })

  console.log(`Proxy Server running at http://localhost:${port}/:key/`)
  console.log(`Upload interface at ws://localhost:${port}/`)

  async function handleClient (socket) {
    let key
    while (true) {
      key = socket.read(32)
      if (key) break
      await E(socket, 'readable')
    }
    let hex = key.toString('hex')
    let archive = hyperdrive(name => ram(), key, { sparse: true })

    await E(archive, 'ready')

    var sw = swarm(archive)
    sw.on('connection', function (peer, type) {
      console.log('Found swarm peer.')
    })

    console.log(`Added site dat://${hex}`)
    sites[hex] = hyperdriveHttp(archive)
    try {
      await F(pump, socket, archive.replicate(), socket)
    } catch (err) {
      if (!err.message.match(/premature close/)) throw err
    } finally {
      console.log('Removed site', hex)
      delete sites[hex]
      sw.close()
    }
  }
}
