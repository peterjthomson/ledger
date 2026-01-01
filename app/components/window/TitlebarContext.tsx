import { createContext, useContext, useState, useMemo, useCallback } from 'react'

interface TitlebarContextProps {
  activeMenuIndex: number | null
  menusVisible: boolean
  setActiveMenuIndex: (index: number | null) => void
  setMenusVisible: (visible: boolean) => void
  closeActiveMenu: () => void
}

const TitlebarContext = createContext<TitlebarContextProps | undefined>(undefined)

export const TitlebarContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null)
  const [menusVisible, setMenusVisible] = useState(false)
  const closeActiveMenu = useCallback(() => setActiveMenuIndex(null), [])

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({ activeMenuIndex, menusVisible, setActiveMenuIndex, setMenusVisible, closeActiveMenu }),
    [activeMenuIndex, menusVisible, closeActiveMenu]
  )

  return (
    <TitlebarContext.Provider value={contextValue}>
      {children}
    </TitlebarContext.Provider>
  )
}

export const useTitlebarContext = () => {
  const context = useContext(TitlebarContext)
  if (!context) {
    throw new Error('useTitlebarContext must be used within a TitlebarContextProvider')
  }
  return context
}
