import HomePage from './pages/HomePage'
import EasyPostSandboxPage from './pages/EasyPostSandboxPage'
import ManaPoolSandboxPage from './pages/ManaPoolSandboxPage'
import TcgplayerSandboxPage from './pages/TcgplayerSandboxPage'

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : '/'
}

function App() {
  const pathname = normalizePath(window.location.pathname)

  if (pathname === '/testing/easypost') {
    return <EasyPostSandboxPage />
  }

  if (pathname === '/testing/manapool') {
    return <ManaPoolSandboxPage />
  }

  if (pathname === '/testing/tcgplayer') {
    return <TcgplayerSandboxPage />
  }

  return <HomePage />
}

export default App
