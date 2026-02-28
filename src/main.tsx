import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!convexUrl) {
  throw new Error('Missing VITE_CONVEX_URL environment variable.')
}

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable.')
}

const convex = new ConvexReactClient(convexUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </ClerkProvider>
  </StrictMode>,
)
