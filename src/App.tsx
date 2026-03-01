import HomePage from './pages/HomePage'
import EasyPostSandboxPage from './pages/EasyPostSandboxPage'
import ManaPoolSandboxPage from './pages/ManaPoolSandboxPage'

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

  return <HomePage />
}

export default App
