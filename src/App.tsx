import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'

function App() {
  const message = useQuery(api.hello.get)

  return (
    <main className="grid min-h-screen place-items-center bg-white p-6 text-slate-900">
      <h1 className="text-3xl font-semibold">{message ?? 'Loading...'}</h1>
    </main>
  )
}

export default App
