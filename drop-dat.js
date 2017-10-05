
import hyperdrive from 'hyperdrive'
import swarm from 'hyperdiscovery'
import ram from 'random-access-memory'
import minimist from 'minimist'
import { readFile } from 'fs'
import { resolve } from 'path'
import { M, E, F } from 'promisey'

main(minimist(process.argv.slice(2))).catch(err => {
  console.error(err.stack)
  return process.exit(1)
})

async function main (argv) {
  if (!argv._.length) {
    console.error('Usage: drop-dat files...')
    return process.exit(2)
  }

  // Create a new in-memory hyperdrive
  let archive = hyperdrive(name => ram())

  // Wait for it to be ready
  await E(archive, 'ready')

  // Add some files to it.
  console.log('Importing file(s)...')
  for (let name of argv._) {
    let fullPath = resolve(process.cwd(), name)
    console.log(`Adding ${fullPath}...`)
    await M(archive, 'writeFile', name, await F(readFile, fullPath))
  }
  var sw = swarm(archive)
  sw.on('connection', (peer, type) => {
    console.log('Found swarm peer', peer, type)
  })
  console.log(`Ready to share: dat://${archive.key.toString('hex')}`)

  // Keep the event loop alive forever.
  console.log('Press Control+C to stop sharing')
  process.stdin.resume()
}
