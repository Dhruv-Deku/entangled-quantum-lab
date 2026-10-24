/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { relayOn } from './server/relay-core.mjs';

/** The shared-lab relay on the dev and preview servers (same host and port as the app). */
const sharedLabRelay = (): Plugin => ({
  name: 'entangled-relay',
  configureServer(server) {
    if (server.httpServer) relayOn(server.httpServer, WebSocketServer);
  },
  configurePreviewServer(server) {
    relayOn(server.httpServer, WebSocketServer);
  },
});

export default defineConfig({
  plugins: [iwsdkDev(), sharedLabRelay()],
  server: {
    host: '0.0.0.0',
    port: 8081,
    open: false,
    // IBM Quantum's servers do not accept calls from web pages (CORS): forward them in development
    proxy: {
      '/ibm-iam': { target: 'https://iam.cloud.ibm.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/ibm-iam/, '') },
      '/ibm-api-eu': { target: 'https://eu-de.quantum.cloud.ibm.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/ibm-api-eu/, '') },
      '/ibm-api': { target: 'https://quantum.cloud.ibm.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/ibm-api/, '') },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
