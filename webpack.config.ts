/**
 * HaloGuard - Webpack Build Configuration
 */

import path from 'path';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';

const isProduction = process.env.NODE_ENV === 'production';

const config: webpack.Configuration = {
  mode: isProduction ? 'production' : 'development',
  devtool: isProduction ? false : 'source-map',
  entry: {
    'service-worker': path.resolve('chrome-extension/src/background/service-worker.ts'),
    'content-script': path.resolve('chrome-extension/src/content/index.ts'),
    'popup': path.resolve('chrome-extension/src/popup/popup.ts'),
  },
  output: {
    path: path.resolve('dist/chrome-extension'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
    alias: {
      '@': path.resolve('chrome-extension/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            tsconfig: path.resolve('chrome-extension/tsconfig.json'),
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'chrome-extension/manifest.json',
          to: 'manifest.json',
        },
        {
          from: 'chrome-extension/src/popup/index.html',
          to: 'popup.html',
        },
        {
          from: 'chrome-extension/src/popup/styles.css',
          to: 'styles.css',
        },
        {
          from: 'chrome-extension/public',
          to: 'public',
        },
      ],
    }),
    ...(isProduction
      ? [
          new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
          }),
        ]
      : []),
  ],
  performance: {
    hints: isProduction ? 'warning' : false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};

export default config;
