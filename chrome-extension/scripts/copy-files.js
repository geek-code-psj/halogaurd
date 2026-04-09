#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const distDir = path.join(__dirname, '../dist');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy manifest.json
const manifestSrc = path.join(__dirname, '../manifest.json');
const manifestDest = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, manifestDest);
  console.log('✓ Copied manifest.json');
}

// Copy popup HTML
const htmlSrc = path.join(srcDir, 'popup/index.html');
const htmlDest = path.join(distDir, 'popup.html');
if (fs.existsSync(htmlSrc)) {
  fs.copyFileSync(htmlSrc, htmlDest);
  console.log('✓ Copied popup.html');
}

// Copy popup CSS
const cssSrc = path.join(srcDir, 'popup/styles.css');
const cssDest = path.join(distDir, 'styles.css');
if (fs.existsSync(cssSrc)) {
  fs.copyFileSync(cssSrc, cssDest);
  console.log('✓ Copied styles.css');
}

// Copy public directory
const publicSrc = path.join(__dirname, '../public');
const publicDest = path.join(distDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
  console.log('✓ Copied public directory');
}

console.log('\n✅ Build complete! Output in ./dist');
