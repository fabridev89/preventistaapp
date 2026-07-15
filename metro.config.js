const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Le decimos a Expo que los archivos .wasm son válidos y debe empaquetarlos
config.resolver.assetExts.push('wasm');

module.exports = config;


