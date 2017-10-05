import babel from 'rollup-plugin-babel'
import shebang from 'rollup-plugin-shebang'
import { dependencies } from './package.json'

export default {
  // Convert to CJS module node.js can use
  input: 'drop-dat.js',
  output: {
    file: 'drop-dat.es5.js',
    format: 'cjs'
  },

  plugins: [

    // Compile down to node 6.x language feature set using babel
    babel({
      exclude: 'node_modules/**',
      presets: [
        ['env', {
          targets: { node: '6.10' },
          modules: false
        }]
      ],
      plugins: ['external-helpers']
    }),

    // Add node shebang to executable script
    shebang()
  ],

  // Assume dependencies in package.json#dependencies are global
  external: Object.keys(dependencies).concat([
    // Also a few select node builtins.
    'fs',
    'path',
    'http'
  ])
}
