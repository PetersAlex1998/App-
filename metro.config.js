const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// pdf-lib nutzt tslib. Die ESM-Variante mit benannten Exporten vermeidet den Web-Fehler
// „Cannot destructure property '__extends' of … default as it is undefined“.
const tslibEs6 = path.join(__dirname, 'node_modules', 'tslib', 'tslib.es6.js');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') return { type: 'sourceFile', filePath: tslibEs6 };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
