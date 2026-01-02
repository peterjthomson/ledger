import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react'
import { Titlebar, TitlebarProps } from './Titlebar'
import { TitlebarContextProvider } from './TitlebarContext'
import type { ChannelReturn } from '@/lib/conveyor/schemas'

type WindowInitProps = ChannelReturn<'window-init'>

interface WindowContextProps {
  titlebar: TitlebarProps
  readonly window: WindowInitProps | undefined
  setTitle: (title: string) => void
  titlebarActions: ReactNode
  setTitlebarActions: (actions: ReactNode) => void
}

const WindowContext = createContext<WindowContextProps | undefined>(undefined)

export const WindowContextProvider = ({
  children,
  titlebar: initialTitlebar = {
    title: 'Ledger Source Control',
    icon: 'appIcon.png',
    titleCentered: false,
    menuItems: [],
  },
}: {
  children: React.ReactNode
  titlebar?: TitlebarProps
}) => {
  const [initProps, setInitProps] = useState<WindowInitProps>()
  const [title, setTitle] = useState(initialTitlebar.title)
  const [titlebarActions, setTitlebarActions] = useState<ReactNode>(null)
  useEffect(() => {
    // Initialize window properties - runs once on mount
    window.conveyor.window.windowInit().then(setInitProps)

    // Add class to parent element
    const parent = document.querySelector('.window-content')?.parentElement
    parent?.classList.add('window-frame')

    // Cleanup: remove class on unmount
    return () => {
      parent?.classList.remove('window-frame')
    }
  }, [])

  const windowProps = useMemo(
    () => initProps || ({ platform: 'darwin' } as WindowInitProps),
    [initProps]
  )

  const titlebar = useMemo(
    () => ({ ...initialTitlebar, title }),
    [initialTitlebar, title]
  )

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({ titlebar, window: windowProps, setTitle, titlebarActions, setTitlebarActions }),
    [titlebar, windowProps, setTitle, titlebarActions, setTitlebarActions]
  )

  return (
    <WindowContext.Provider value={contextValue}>
      <TitlebarContextProvider>
        <Titlebar />
      </TitlebarContextProvider>
      <div className="window-content">{children}</div>
    </WindowContext.Provider>
  )
}

export const useWindowContext = () => {
  const context = useContext(WindowContext)
  if (!context) {
    throw new Error('useWindowContext must be used within a WindowContextProvider')
  }
  return context
}
