import hyperdrive from 'hyperdrive'
import swarm from 'hyperdiscovery'
import ram from 'random-access-memory'
import minimist from 'minimist'
import pump from 'pump'
import hyperdriveHttp from 'hyperdrive-http'
import websocket from 'websocket-stream'
import { readFile, stat, readdir, createReadStream } from 'fs'
import { resolve, join } from 'path'
import { M, E, F } from 'promisey'
import { createServer } from 'http'

const PORT = parseInt(process.env.PORT || '0') || 8040
const HOST = process.env.HOST || 'localhost'

main(minimist(process.argv.slice(2))).catch(err => {
  console.error(err.stack)
  return process.exit(1)
})

function parseUrl (url) {
  let host, port
  console.log('PARSE', {url})
  if (url === true) {
    host = HOST
    port = PORT
  } else {
    let match = url.match(/^(.*):([0-9]*)$/)
    if (match) {
      host = match[1] || HOST
      port = parseInt(match[2] || '0', 10) || PORT
    } else {
      match = url.match(/^[0-9]+$/)
      if (match) {
        host = HOST
        port = parseInt(match[0], 10)
      } else {
        host = url || HOST
        port = PORT
      }
    }
  }
  return { host, port }
}

async function main (argv) {
  // Run a server if the `--serve` option is given
  if (argv.serve) return serve(argv.serve)

  if (!argv._.length || argv.h || argv.help) {
    var stream = createReadStream(join(__dirname, 'USAGE'))
    stream.pipe(process.stdout)
    stream.on('end', () => { process.exit(2) })
    return
  }

  // Create a new in-memory hyperdrive
  let archive = hyperdrive(name => ram())

  // Wait for it to be ready
  await E(archive, 'ready')

  console.error('Importing file(s):')
  let cwd = process.cwd()
  await importList('.', argv._)

  async function importList (base, names) {
    for (let name of names) {
      let path = join(base, name)
      let fullPath = resolve(cwd, path)
      let meta = await F(stat, fullPath)
      if (meta.isDirectory()) {
        let children = await F(readdir, fullPath)
        await importList(path, children.filter(name => name[0] !== '.'))
      }
      if (meta.isFile()) {
        console.error(`  ${path}`)
        await M(archive, 'writeFile', path, await F(readFile, fullPath))
      }
    }
  }

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
  let { host, port } = parseUrl(url)
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

async function serve (url) {
  let { host, port } = parseUrl(url)
  let sites = {}

  let server = createServer((req, res) => {
    // See if the request matches
    let match = req.url.match(/\/([0-9a-f]{64})\//)
    let site = match && sites[match[1]]
    if (!site) return res.writeHead(404)
    req.url = req.url.replace(match[0], '/')
    return site(req, res)
  }).listen({host, port})

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

    console.log(`Added site dat://${hex}`)
    sites[hex] = hyperdriveHttp(archive, {
      exposeHeaders: true,
      live: true,
      footer: `Served by Drop-Dat`
    })
    try {
      await F(pump, socket, archive.replicate(), socket)
    } catch (err) {
      if (!err.message.match(/premature close/)) throw err
    } finally {
      console.log('Removed site', hex)
      delete sites[hex]
    }
  }
}
