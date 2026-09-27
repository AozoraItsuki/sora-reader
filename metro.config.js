const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

const path = require('path');
const fs = require('fs');
const defaultConfig = getDefaultConfig(__dirname);

const map = {
  '.ico': 'image/x-icon',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const customConfig = {
  resolver: {
    unstable_enableSymlinks: true,
    sourceExts: [...defaultConfig.resolver.sourceExts, 'sql'],
    // cheerio 1.2's default ESM entry imports `node:stream`, which Metro cannot
    // resolve. Redirect bare `cheerio` imports to its published browser build
    // (no node: imports, same `load` API used by this app).
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'cheerio') {
        return {
          filePath: path.join(
            __dirname,
            'node_modules/cheerio/dist/browser/index.js',
          ),
          type: 'sourceFile',
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  server: {
    port: 8081,
    enhanceMiddleware: (metroMiddleware, metroServer) => {
      return (request, res, next) => {
        const filePath = path.join(
          __dirname,
          'android/app/src/main',
          request._parsedUrl.path || '',
        );
        const ext = path.parse(filePath).ext;
        if (fs.existsSync(filePath)) {
          try {
            const data = fs.readFileSync(filePath);
            res.setHeader('Content-type', map[ext] || 'text/plain');
            res.end(data);
          } catch (err) {
            res.statusCode = 500;
            res.end(`Error getting the file: ${err}.`);
          }
        } else {
          return metroMiddleware(request, res, next);
        }
      };
    },
  },
};
module.exports = mergeConfig(defaultConfig, customConfig);
