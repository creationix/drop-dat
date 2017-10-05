
import hyperdrive from 'hyperdrive'
import swarm from 'hyperdiscovery'
import ram from 'random-access-memory'
import minimist from 'minimist'
import pump from 'pump'
import hyperdriveHttp from 'hyperdrive-http'
import { readFile } from 'fs'
import { resolve } from 'path'
import { M, E, F } from 'promisey'
import { createServer as createNetServer, connect } from 'net'
import { createServer } from 'http'

const DEFAULT_UPLOAD_PORT = parseInt(process.env.DROP_DAT_UPLOAD_PORT || '0') || 8041
const DEFAULT_HTTP_PORT = parseInt(process.env.DROP_DAT_HTTP_PORT || '0') || 8040

main(minimist(process.argv.slice(2))).catch(err => {
  console.error(err.stack)
  return process.exit(1)
})

async function main (argv) {
  if (argv.serve) return serve(argv.serve)

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
  let [host, port = DEFAULT_UPLOAD_PORT] = url.split(':')
  let socket = connect({host, port})
  await E(socket, 'connect')
  console.error('Connected to Server, uploading...')
  await M(socket, 'write', archive.key)
  console.log(`http://${host}:${DEFAULT_HTTP_PORT}/${archive.key.toString('hex')}/`)
  await F(pump, socket, archive.replicate({ upload: true, live: true }), socket)
}

async function serve (port) {
  let sites = {}
  if (typeof port !== 'number') port = DEFAULT_UPLOAD_PORT
  createNetServer(socket => {
    console.log('CLIENT')
    handleClient(socket).catch(err => {
      console.error('Error handling client', err.stack)
    })
  }).listen(port)
  console.error(`Dat Gateway Service Listening on tcp port ${port}`)

  createServer((req, res) => {
    let match = req.url.match(/\/([0-9a-f]{64})\//)
    let site = match && sites[match[1]]
    if (!site) return res.writeHead(404)
    req.url = req.url.replace(match[0], '/')
    return site(req, res)
  }).listen(DEFAULT_HTTP_PORT)

  async function handleClient (socket) {
    // Read 32 bytes as the key
    let key
    while (true) {
      key = socket.read(32)
      if (key) break
      await E(socket, 'readable')
    }
    let hex = key.toString('hex')
    let archive = hyperdrive(name => ram(), key, { sparse: true })
    await E(archive, 'ready')
    console.log('Added site', hex)
    sites[hex] = hyperdriveHttp(archive)
    try {
      await F(pump, socket, archive.replicate({download: true}), socket)
    } catch (err) {
      if (!err.message.match(/premature close/)) throw err
    } finally {
      console.log('Removed site', hex)
      delete sites[hex]
    }
  }
}
