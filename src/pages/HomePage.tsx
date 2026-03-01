import { useConvexAuth, useQuery } from 'convex/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'

function HomePage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const message = useQuery(api.hello.get, isAuthenticated && !isLoading ? {} : 'skip')

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
          <div className="space-y-4 text-center">
            <h1 className="text-3xl font-semibold">{message ?? 'Loading...'}</h1>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <a
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                href="/testing/manapool"
              >
                ManaPool Sandbox
              </a>
              <a
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                href="/testing/easypost"
              >
                EasyPost Sandbox
              </a>
            </div>
          </div>
        </SignedIn>
      </section>
    </main>
  )
}

export default HomePage
