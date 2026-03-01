import { useState } from 'react'
import { useAction, useConvexAuth } from 'convex/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'

type ActionDefinition = {
  key: string
  title: string
  description: string
  defaultInput: string
  onRun: (input: Record<string, unknown>) => Promise<unknown>
}

type ActionSection = {
  key: string
  title: string
  description: string
  actions: ActionDefinition[]
}

type ActionCardProps = {
  action: ActionDefinition
  disabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseActionInput(input: string): Record<string, unknown> {
  const trimmed = input.trim()
  if (trimmed.length === 0) return {}

  const parsed: unknown = JSON.parse(trimmed)
  if (!isRecord(parsed)) {
    throw new Error('Input must be a JSON object.')
  }
  return parsed
}

function extractActionErrorMessage(err: unknown) {
  const fallback = 'Unknown error'
  if (!(err instanceof Error)) return fallback
  const message = err.message.trim()
  const uncaughtMatch = message.match(/Uncaught Error:\s*([\s\S]*)/)
  if (uncaughtMatch?.[1]) {
    return uncaughtMatch[1].trim()
  }
  const serverErrorMatch = message.match(/Server Error\s*([\s\S]*)/)
  if (serverErrorMatch?.[1]) {
    return serverErrorMatch[1].trim()
  }
  return message || fallback
}

function renderResult(result: unknown) {
  if (typeof result === 'string') return result
  return JSON.stringify(result ?? null, null, 2)
}

function ActionCard({ action, disabled }: ActionCardProps) {
  const [input, setInput] = useState(action.defaultInput)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  const handleRun = async () => {
    setIsRunning(true)
    setError(null)

    const start = Date.now()
    try {
      const parsedInput = parseActionInput(input)
      const response = await action.onRun(parsedInput)
      setResult(response)
      setDurationMs(Date.now() - start)
    } catch (err) {
      setError(extractActionErrorMessage(err))
      setDurationMs(Date.now() - start)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <article className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{action.title}</h3>
        <p className="text-sm text-slate-600">{action.description}</p>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-700" htmlFor={action.key}>
          JSON Args
        </label>
        <textarea
          className="h-36 w-full rounded border border-slate-300 p-2 font-mono text-xs"
          id={action.key}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          value={input}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={disabled || isRunning}
          onClick={() => {
            handleRun().catch((err) => {
              setError(extractActionErrorMessage(err))
            })
          }}
          type="button"
        >
          {isRunning ? 'Running...' : 'Run Action'}
        </button>
        <button
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          disabled={isRunning}
          onClick={() => {
            setInput(action.defaultInput)
            setError(null)
            setResult(null)
            setDurationMs(null)
          }}
          type="button"
        >
          Reset
        </button>
      </div>

      {durationMs !== null && (
        <p className="text-xs text-slate-500">Last run: {durationMs}ms</p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
        {renderResult(result)}
      </pre>
    </article>
  )
}

function TcgplayerSandboxPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const canRunActions = isAuthenticated && !isLoading

  const searchOrdersAction = useAction(api.tcgplayer.actions.searchOrdersAction)
  const getOrderDetailAction = useAction(api.tcgplayer.actions.getOrderDetailAction)
  const exportOrdersAction = useAction(api.tcgplayer.actions.exportOrdersAction)
  const exportPullSheetsAction = useAction(api.tcgplayer.actions.exportPullSheetsAction)
  const exportPackingSlipsAction = useAction(api.tcgplayer.actions.exportPackingSlipsAction)
  const getPendingPaymentsAction = useAction(api.tcgplayer.actions.getPendingPaymentsAction)
  const syncDataAction = useAction(api.tcgplayer.actions.syncDataAction)

  const sections: ActionSection[] = [
    {
      key: 'orders',
      title: 'Orders',
      description: 'Search and load TCGPlayer order details.',
      actions: [
        {
          key: 'search-orders',
          title: 'searchOrdersAction',
          description: 'Search orders and refresh changed/new order details.',
          defaultInput: '{"from":0,"size":25}',
          onRun: (input) =>
            searchOrdersAction(input as Parameters<typeof searchOrdersAction>[0]),
        },
        {
          key: 'get-order-detail',
          title: 'getOrderDetailAction',
          description: 'Fetch full detail for one order by order number.',
          defaultInput: '{"orderNumber":"E576ED4C-57F9B2-7B826"}',
          onRun: (input) =>
            getOrderDetailAction(input as Parameters<typeof getOrderDetailAction>[0]),
        },
      ],
    },
    {
      key: 'exports',
      title: 'Exports',
      description: 'Generate base64 document exports for orders, pull sheets, and packing slips.',
      actions: [
        {
          key: 'export-orders',
          title: 'exportOrdersAction',
          description: 'Export matching orders as CSV base64 with metadata.',
          defaultInput: '{"timezoneOffset":-5,"from":0,"size":1000}',
          onRun: (input) =>
            exportOrdersAction(input as Parameters<typeof exportOrdersAction>[0]),
        },
        {
          key: 'export-pull-sheets',
          title: 'exportPullSheetsAction',
          description: 'Export pull sheets for provided order numbers.',
          defaultInput:
            '{"timezoneOffset":-5,"orderNumbers":["E576ED4C-57F9B2-7B826"],"sortingType":"ByRelease","format":"Default"}',
          onRun: (input) =>
            exportPullSheetsAction(input as Parameters<typeof exportPullSheetsAction>[0]),
        },
        {
          key: 'export-packing-slips',
          title: 'exportPackingSlipsAction',
          description: 'Export packing slips for provided order numbers.',
          defaultInput:
            '{"timezoneOffset":-5,"orderNumbers":["E576ED4C-57F9B2-7B826"]}',
          onRun: (input) =>
            exportPackingSlipsAction(
              input as Parameters<typeof exportPackingSlipsAction>[0],
            ),
        },
      ],
    },
    {
      key: 'payments-sync',
      title: 'Payments And Sync',
      description: 'Fetch pending payment breakdown and run full sync.',
      actions: [
        {
          key: 'get-pending-payments',
          title: 'getPendingPaymentsAction',
          description: 'Load and parse pending payments HTML snapshot.',
          defaultInput: '{}',
          onRun: (input) =>
            getPendingPaymentsAction(input as Parameters<typeof getPendingPaymentsAction>[0]),
        },
        {
          key: 'sync-data',
          title: 'syncDataAction',
          description: 'Run full manual sync for LastThreeMonths order data.',
          defaultInput: '{"pageSize":100,"maxPages":100}',
          onRun: (input) => syncDataAction(input as Parameters<typeof syncDataAction>[0]),
        },
      ],
    },
  ]

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <a className="text-sm text-slate-600 hover:text-slate-900" href="/">
          Back to home
        </a>
        <SignedOut>
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <section className="mx-auto mt-6 w-full max-w-7xl space-y-4">
        <h1 className="text-3xl font-semibold">TCGPlayer Sandbox</h1>
        <p className="text-sm text-slate-600">
          This page exposes every public TCGPlayer Convex action. Sign in as an admin user,
          then run actions with JSON args and inspect raw responses.
        </p>
        <p className="text-sm text-slate-600">
          Required backend env vars: `TCGPLAYER_SELLER_KEY` and `TCGPLAYER_SESSION_COOKIE`.
        </p>

        <SignedOut>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sign in as an admin user to run TCGPlayer actions.
          </div>
        </SignedOut>

        <SignedIn>
          {!canRunActions && (
            <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Auth context is loading. Actions are temporarily disabled.
            </div>
          )}
        </SignedIn>

        {sections.map((section) => (
          <section key={section.key} className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="text-sm text-slate-600">{section.description}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {section.actions.map((action) => (
                <ActionCard action={action} disabled={!canRunActions} key={action.key} />
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  )
}

export default TcgplayerSandboxPage
