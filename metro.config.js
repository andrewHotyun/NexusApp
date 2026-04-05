const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Removed manual sourceExts override to fix Metro hang in SDK 54.
// getDefaultConfig already includes all standard extensions.

module.exports = config;
