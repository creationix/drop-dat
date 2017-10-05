#!/usr/bin/env node

const hyperdrive = require('hyperdrive')
const swarm = require('hyperdiscovery')
const ram = require('random-access-memory')
const minimist = require('minimist')
const { readFile } = require('fs')
const { resolve } = require('path')
const { M, E, F } = require('promisey')

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
