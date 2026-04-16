import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

interface Ctx {
  state: UpdateState
  installAndRestart: () => void
}

const UpdaterCtx = createContext<Ctx>({
  state: { kind: 'idle' },
  installAndRestart: () => {},
})

interface SpectraUpdater {
  onChecking?: (cb: () => void) => void
  onAvailable: (cb: (info: { version: string }) => void) => void
  onProgress: (cb: (p: { percent: number }) => void) => void
  onDownloaded: (cb: (info: { version: string }) => void) => void
  onError: (cb: (e: { message: string }) => void) => void
  installAndRestart: () => void
}

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' })

  useEffect(() => {
    const updater = (window as unknown as { spectraUpdater?: SpectraUpdater }).spectraUpdater
    if (!updater) return

    updater.onChecking?.(() => setState(prev => (prev.kind === 'ready' ? prev : { kind: 'checking' })))
    updater.onAvailable(info => setState({ kind: 'available', version: info.version }))
    updater.onProgress(p => setState({ kind: 'progress', percent: Math.round(p.percent) }))
    updater.onDownloaded(info => setState({ kind: 'ready', version: info.version }))
    updater.onError(e => setState({ kind: 'error', message: e.message }))
  }, [])

  const installAndRestart = () => {
    const updater = (window as unknown as { spectraUpdater?: SpectraUpdater }).spectraUpdater
    updater?.installAndRestart()
  }

  return (
    <UpdaterCtx.Provider value={{ state, installAndRestart }}>
      {children}
    </UpdaterCtx.Provider>
  )
}

export function useUpdater(): Ctx {
  return useContext(UpdaterCtx)
}
