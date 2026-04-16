'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('quit-app'),
})

contextBridge.exposeInMainWorld('spectraUpdater', {
  onChecking:   (cb) => ipcRenderer.on('update:checking',   (_, p) => cb(p)),
  onAvailable:  (cb) => ipcRenderer.on('update:available',  (_, p) => cb(p)),
  onNone:       (cb) => ipcRenderer.on('update:none',       (_, p) => cb(p)),
  onProgress:   (cb) => ipcRenderer.on('update:progress',   (_, p) => cb(p)),
  onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_, p) => cb(p)),
  onError:      (cb) => ipcRenderer.on('update:error',      (_, p) => cb(p)),
  installAndRestart: () => ipcRenderer.send('install-update'),
})