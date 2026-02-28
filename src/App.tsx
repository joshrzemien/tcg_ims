import { useQuery } from 'convex/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../convex/_generated/api'

function App() {
  const message = useQuery(api.hello.get)

  return (
    <main className="min-h-screen bg-white p-6 text-slate-900">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-end gap-3">
        <SignedOut>
          <SignInButton />
          <SignUpButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <section className="grid min-h-[calc(100vh-120px)] place-items-center">
        <h1 className="text-3xl font-semibold">{message ?? 'Loading...'}</h1>
      </section>
    </main>
  )
}

export default App
