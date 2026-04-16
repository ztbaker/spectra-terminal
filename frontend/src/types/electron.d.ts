declare global {
  interface Window {
    electronAPI?: {
      quit: () => void
    }
  }
}

export {}