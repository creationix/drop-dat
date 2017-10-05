import babel from 'rollup-plugin-babel'
import shebang from 'rollup-plugin-shebang'

export default {
  input: 'drop-dat.js',
  output: {
    file: 'drop-dat.es5.js',
    format: 'cjs'
  },
  plugins: [
    babel({
      exclude: 'node_modules/**'
    }),
    shebang()
  ]
}
