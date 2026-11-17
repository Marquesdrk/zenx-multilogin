import { LoaderCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import type { PageId } from '@shared/types'
import { Toaster } from './components/common'
import { ClosePromptDialog, GroupFormDialog, JustCreatedDialog, ProfileFormSheet } from './components/forms'
import { Sidebar, TopBar } from './components/layout'
import { subscribe } from './lib/api'
import { DashboardPage } from './pages/DashboardPage'
import { GroupsPage } from './pages/GroupsPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { SettingsPage } from './pages/SettingsPage'
import { useApp } from './store'

const pages: Record<PageId, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  profiles: ProfilesPage,
  groups: GroupsPage,
  settings: SettingsPage
}

export function App() {
  const ready = useApp((s) => s.ready)
  const bootError = useApp((s) => s.bootError)
  const page = useApp((s) => s.page)

  useEffect(() => {
    const store = useApp.getState()
    void store.init()
    const offState = subscribe('browser:state', ({ id, state }) => useApp.getState().applyBrowserState(id, state))
    const offClose = subscribe('app:closeRequested', (prompt) => useApp.getState().setClosePrompt(prompt))
    return () => {
      offState()
      offClose()
    }
  }, [])

  if (!ready) {
    return (
      <div className="app-backdrop drag grid h-full place-items-center">
        {bootError ? (
          <div className="glass max-w-sm p-6 text-center">
            <p className="text-[14px] font-semibold">Não foi possível carregar o aplicativo</p>
            <p className="mt-1.5 text-[13px] text-muted">{bootError}</p>
          </div>
        ) : (
          <LoaderCircle className="size-6 animate-spin text-brand-soft" />
        )}
      </div>
    )
  }

  const Page = pages[page]
  return (
    <div className="app-backdrop flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col px-7 pb-6 pt-6"
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ProfileFormSheet />
      <GroupFormDialog />
      <JustCreatedDialog />
      <ClosePromptDialog />
      <Toaster />
    </div>
  )
}
