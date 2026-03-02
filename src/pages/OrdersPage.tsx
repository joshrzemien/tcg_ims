import { useEffect, useMemo, useState } from 'react'
import { useAction, useConvexAuth } from 'convex/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'

type SourceKey = 'manapool' | 'tcgplayer'

function formatMoney(cents: number | undefined) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function formatDate(value: string | undefined) {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed).toLocaleString()
}

function sourceLabel(source: SourceKey) {
  return source === 'manapool' ? 'ManaPool' : 'TCGplayer'
}

function OrdersPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const loadOrdersAction = useAction(api.orders.actions.loadAction)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [response, setResponse] = useState<Awaited<ReturnType<typeof loadOrdersAction>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canLoad = isAuthenticated && !isLoading

  useEffect(() => {
    let isCancelled = false

    const run = async () => {
      if (!canLoad) return
      setIsRefreshing(true)
      setError(null)

      try {
        const result = await loadOrdersAction({ from: 0, size: 50 })
        if (!isCancelled) {
          setResponse(result)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load orders.')
        }
      } finally {
        if (!isCancelled) {
          setIsRefreshing(false)
        }
      }
    }

    run().catch(() => undefined)

    return () => {
      isCancelled = true
    }
  }, [canLoad, loadOrdersAction])

  const overallStatus = useMemo(() => {
    if (!response) return 'idle'
    const manapool = response.sources.manapool.status
    const tcgplayer = response.sources.tcgplayer.status

    if (response.total === 0 && manapool === 'error' && tcgplayer === 'error') {
      return 'error'
    }
    if (manapool === 'error' || tcgplayer === 'error') {
      return 'degraded'
    }
    return 'ok'
  }, [response])

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal" />
            <SignUpButton mode="modal" />
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <section className="mx-auto mt-6 w-full max-w-7xl space-y-4">
        <SignedOut>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Sign in as an admin user to load orders.
          </div>
        </SignedOut>

        <SignedIn>
          {!canLoad && (
            <div className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Auth context is loading. Orders will load automatically.
            </div>
          )}
        </SignedIn>

        {canLoad && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <article className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Overall</p>
                <p className="mt-1 text-lg font-semibold capitalize">{overallStatus}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Served: {formatDate(response?.servedAt)}
                </p>
              </article>

              {(['manapool', 'tcgplayer'] as const).map((source) => {
                const status = response?.sources[source]
                return (
                  <article className="rounded-lg border border-slate-200 bg-white p-4" key={source}>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {sourceLabel(source)}
                    </p>
                    <p className="mt-1 text-lg font-semibold capitalize">{status?.status ?? 'idle'}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Last success: {formatDate(status?.lastSuccessAt)}
                    </p>
                    {status?.lastError && status.lastError.length > 0 && (
                      <p className="mt-2 text-xs text-red-700">{status.lastError}</p>
                    )}
                  </article>
                )
              })}
            </section>

            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {isRefreshing && (
              <div className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                Loading orders...
              </div>
            )}

            {!isRefreshing && response && response.orders.length === 0 && !error && (
              <div className="rounded-lg border border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
                No orders found yet.
              </div>
            )}

            {response && response.orders.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Order ID</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Buyer</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Created</th>
                      <th className="px-3 py-2 font-medium">Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.orders.map((order) => (
                      <tr className="border-t border-slate-200" key={order.id}>
                        <td className="px-3 py-2">{sourceLabel(order.source)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{order.sourceOrderId}</td>
                        <td className="px-3 py-2">
                          {order.latestFulfillmentStatus ?? order.status ?? '—'}
                        </td>
                        <td className="px-3 py-2">{order.buyerName ?? '—'}</td>
                        <td className="px-3 py-2">{formatMoney(order.totalCents)}</td>
                        <td className="px-3 py-2">{formatDate(order.createdAt)}</td>
                        <td className="px-3 py-2">{formatDate(order.syncUpdatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default OrdersPage
