import { useQuery } from 'convex/react'
import {
  useAuth,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../convex/_generated/api'

function App() {
  const { isSignedIn } = useAuth()
  const message = useQuery(api.hello.get, isSignedIn ? {} : 'skip')

  return (
    <main className="min-h-screen bg-white p-6 text-slate-900">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-end gap-3">
        <SignedOut>
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <section className="grid min-h-[calc(100vh-120px)] place-items-center">
        <SignedOut>
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Sign in to continue</h1>
            <p className="mt-3 text-slate-600">
              Use the buttons above to access the app.
            </p>
          </div>
        </SignedOut>
        <SignedIn>
          <h1 className="text-3xl font-semibold">{message ?? 'Loading...'}</h1>
        </SignedIn>
      </section>
    </main>
  )
}

export default App
