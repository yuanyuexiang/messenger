const path = require('path');

module.exports = {
  entry: './src/index.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json'
          }
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      "bufferutil": false,
      "utf-8-validate": false
    }
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'commonjs2',
      export: 'default'
    },
    globalObject: 'this',
  },
  externals: {
    // 保留 Directus 相关的外部依赖
    '@directus/extensions-sdk': '@directus/extensions-sdk',
    '@directus/services': '@directus/services',
  },
  ignoreWarnings: [
    /Module not found: Error: Can't resolve 'bufferutil'/,
    /Module not found: Error: Can't resolve 'utf-8-validate'/,
  ],
};
