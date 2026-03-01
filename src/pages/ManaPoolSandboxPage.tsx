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

function ManaPoolSandboxPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const canRunActions = isAuthenticated && !isLoading

  const getSinglesPricesAction = useAction(api.manapool.actions.getSinglesPricesAction)
  const getSealedPricesAction = useAction(api.manapool.actions.getSealedPricesAction)
  const getVariantPricesAction = useAction(api.manapool.actions.getVariantPricesAction)
  const lookupSinglesAction = useAction(api.manapool.actions.lookupSinglesAction)
  const lookupSealedAction = useAction(api.manapool.actions.lookupSealedAction)
  const getListingsByIdsAction = useAction(api.manapool.actions.getListingsByIdsAction)
  const getListingByIdAction = useAction(api.manapool.actions.getListingByIdAction)
  const listSellerInventoryAction = useAction(api.manapool.actions.listSellerInventoryAction)
  const batchUpsertByTcgskuAction = useAction(api.manapool.actions.batchUpsertByTcgskuAction)
  const batchUpsertByProductAction = useAction(api.manapool.actions.batchUpsertByProductAction)
  const batchUpsertByScryfallIdAction = useAction(
    api.manapool.actions.batchUpsertByScryfallIdAction,
  )
  const batchUpsertByTcgplayerIdAction = useAction(
    api.manapool.actions.batchUpsertByTcgplayerIdAction,
  )
  const getSellerInventoryItemAction = useAction(
    api.manapool.actions.getSellerInventoryItemAction,
  )
  const upsertSellerInventoryItemAction = useAction(
    api.manapool.actions.upsertSellerInventoryItemAction,
  )
  const deleteSellerInventoryItemAction = useAction(
    api.manapool.actions.deleteSellerInventoryItemAction,
  )
  const batchGetTcgskuInventoryAction = useAction(
    api.manapool.actions.batchGetTcgskuInventoryAction,
  )
  const listInventoryAnomaliesAction = useAction(
    api.manapool.actions.listInventoryAnomaliesAction,
  )
  const countInventoryAnomaliesAction = useAction(
    api.manapool.actions.countInventoryAnomaliesAction,
  )
  const createBulkPricingJobAction = useAction(
    api.manapool.actions.createBulkPricingJobAction,
  )
  const countBulkPricingAction = useAction(api.manapool.actions.countBulkPricingAction)
  const previewBulkPricingAction = useAction(api.manapool.actions.previewBulkPricingAction)
  const listBulkPricingJobsAction = useAction(api.manapool.actions.listBulkPricingJobsAction)
  const getBulkPricingJobAction = useAction(api.manapool.actions.getBulkPricingJobAction)
  const getRecentBulkPricingJobAction = useAction(
    api.manapool.actions.getRecentBulkPricingJobAction,
  )
  const exportBulkPricingJobCsvAction = useAction(
    api.manapool.actions.exportBulkPricingJobCsvAction,
  )
  const listSellerOrdersAction = useAction(api.manapool.actions.listSellerOrdersAction)
  const getSellerOrderAction = useAction(api.manapool.actions.getSellerOrderAction)
  const upsertSellerOrderFulfillmentAction = useAction(
    api.manapool.actions.upsertSellerOrderFulfillmentAction,
  )
  const getSellerOrderReportsAction = useAction(
    api.manapool.actions.getSellerOrderReportsAction,
  )
  const listWebhooksAction = useAction(api.manapool.actions.listWebhooksAction)
  const getWebhookAction = useAction(api.manapool.actions.getWebhookAction)
  const registerWebhookAction = useAction(api.manapool.actions.registerWebhookAction)
  const deleteWebhookAction = useAction(api.manapool.actions.deleteWebhookAction)

  const sections: ActionSection[] = [
    {
      key: 'pricing',
      title: 'Price Feeds',
      description: 'Public ManaPool price endpoints for singles, sealed, and variants.',
      actions: [
        {
          key: 'get-singles-prices',
          title: 'getSinglesPricesAction',
          description: 'Fetch singles prices in JSON or CSV.',
          defaultInput: '{"format":"json"}',
          onRun: (input) =>
            getSinglesPricesAction(input as Parameters<typeof getSinglesPricesAction>[0]),
        },
        {
          key: 'get-sealed-prices',
          title: 'getSealedPricesAction',
          description: 'Fetch sealed prices in JSON or CSV.',
          defaultInput: '{"format":"json"}',
          onRun: (input) =>
            getSealedPricesAction(input as Parameters<typeof getSealedPricesAction>[0]),
        },
        {
          key: 'get-variant-prices',
          title: 'getVariantPricesAction',
          description: 'Fetch variant prices in JSON or CSV.',
          defaultInput: '{"format":"json"}',
          onRun: (input) =>
            getVariantPricesAction(input as Parameters<typeof getVariantPricesAction>[0]),
        },
      ],
    },
    {
      key: 'catalog',
      title: 'Product Lookup',
      description: 'Catalog lookups by external IDs and inventory listing IDs.',
      actions: [
        {
          key: 'lookup-singles',
          title: 'lookupSinglesAction',
          description: 'Lookup singles by one supported ID family (max 100 IDs).',
          defaultInput: '{"tcgplayerSkuIds":[275488373]}',
          onRun: (input) =>
            lookupSinglesAction(input as Parameters<typeof lookupSinglesAction>[0]),
        },
        {
          key: 'lookup-sealed',
          title: 'lookupSealedAction',
          description: 'Lookup sealed products by one supported ID family (max 100 IDs).',
          defaultInput: '{"tcgplayerIds":[232857]}',
          onRun: (input) =>
            lookupSealedAction(input as Parameters<typeof lookupSealedAction>[0]),
        },
        {
          key: 'get-listings-by-ids',
          title: 'getListingsByIdsAction',
          description: 'Fetch inventory listings by listing IDs.',
          defaultInput: '{"ids":["listing-id-1"]}',
          onRun: (input) =>
            getListingsByIdsAction(input as Parameters<typeof getListingsByIdsAction>[0]),
        },
        {
          key: 'get-listing-by-id',
          title: 'getListingByIdAction',
          description: 'Fetch one inventory listing by listing ID.',
          defaultInput: '{"id":"listing-id-1"}',
          onRun: (input) =>
            getListingByIdAction(input as Parameters<typeof getListingByIdAction>[0]),
        },
      ],
    },
    {
      key: 'inventory',
      title: 'Seller Inventory',
      description: 'List, upsert, get, delete, and batch-get seller inventory.',
      actions: [
        {
          key: 'list-seller-inventory',
          title: 'listSellerInventoryAction',
          description: 'List seller inventory (requires admin auth + ManaPool creds).',
          defaultInput: '{"limit":25,"offset":0}',
          onRun: (input) =>
            listSellerInventoryAction(input as Parameters<typeof listSellerInventoryAction>[0]),
        },
        {
          key: 'batch-upsert-by-tcgsku',
          title: 'batchUpsertByTcgskuAction',
          description: 'Bulk upsert inventory by TCG SKU.',
          defaultInput:
            '{"items":[{"tcgplayerSku":123456789,"priceCents":199,"quantity":3}]}',
          onRun: (input) =>
            batchUpsertByTcgskuAction(input as Parameters<typeof batchUpsertByTcgskuAction>[0]),
        },
        {
          key: 'batch-upsert-by-product',
          title: 'batchUpsertByProductAction',
          description: 'Bulk upsert inventory by product type/product ID.',
          defaultInput:
            '{"items":[{"productType":"singles","productId":"product-id","priceCents":199,"quantity":3}]}',
          onRun: (input) =>
            batchUpsertByProductAction(input as Parameters<typeof batchUpsertByProductAction>[0]),
        },
        {
          key: 'batch-upsert-by-scryfall-id',
          title: 'batchUpsertByScryfallIdAction',
          description: 'Bulk upsert inventory by Scryfall ID + variant dimensions.',
          defaultInput:
            '{"items":[{"scryfallId":"00000000-0000-0000-0000-000000000000","languageId":"EN","finishId":"nonfoil","conditionId":"NM","priceCents":199,"quantity":3}]}',
          onRun: (input) =>
            batchUpsertByScryfallIdAction(
              input as Parameters<typeof batchUpsertByScryfallIdAction>[0],
            ),
        },
        {
          key: 'batch-upsert-by-tcgplayer-id',
          title: 'batchUpsertByTcgplayerIdAction',
          description: 'Bulk upsert inventory by TCGplayer product ID + variant dimensions.',
          defaultInput:
            '{"items":[{"tcgplayerId":123456,"languageId":"EN","finishId":null,"conditionId":null,"priceCents":199,"quantity":3}]}',
          onRun: (input) =>
            batchUpsertByTcgplayerIdAction(
              input as Parameters<typeof batchUpsertByTcgplayerIdAction>[0],
            ),
        },
        {
          key: 'get-seller-inventory-item',
          title: 'getSellerInventoryItemAction',
          description: 'Get one seller inventory item by tcgsku/product/scryfall/tcgplayer lookup.',
          defaultInput: '{"lookup":{"type":"tcgsku","sku":123456789}}',
          onRun: (input) =>
            getSellerInventoryItemAction(
              input as Parameters<typeof getSellerInventoryItemAction>[0],
            ),
        },
        {
          key: 'upsert-seller-inventory-item',
          title: 'upsertSellerInventoryItemAction',
          description: 'Set price/quantity for one inventory lookup target.',
          defaultInput:
            '{"lookup":{"type":"tcgsku","sku":123456789},"priceCents":199,"quantity":3}',
          onRun: (input) =>
            upsertSellerInventoryItemAction(
              input as Parameters<typeof upsertSellerInventoryItemAction>[0],
            ),
        },
        {
          key: 'delete-seller-inventory-item',
          title: 'deleteSellerInventoryItemAction',
          description: 'Delete one inventory item by lookup target.',
          defaultInput: '{"lookup":{"type":"tcgsku","sku":123456789}}',
          onRun: (input) =>
            deleteSellerInventoryItemAction(
              input as Parameters<typeof deleteSellerInventoryItemAction>[0],
            ),
        },
        {
          key: 'batch-get-tcgsku-inventory',
          title: 'batchGetTcgskuInventoryAction',
          description: 'Fetch up to 500 tcgskus in a single call.',
          defaultInput: '{"skus":[123456789]}',
          onRun: (input) =>
            batchGetTcgskuInventoryAction(
              input as Parameters<typeof batchGetTcgskuInventoryAction>[0],
            ),
        },
      ],
    },
    {
      key: 'inventory-anomalies',
      title: 'Inventory Anomalies',
      description: 'Review anomaly list and count for seller inventory.',
      actions: [
        {
          key: 'list-inventory-anomalies',
          title: 'listInventoryAnomaliesAction',
          description: 'List inventory anomalies.',
          defaultInput: '{"limit":25,"offset":0}',
          onRun: (input) =>
            listInventoryAnomaliesAction(
              input as Parameters<typeof listInventoryAnomaliesAction>[0],
            ),
        },
        {
          key: 'count-inventory-anomalies',
          title: 'countInventoryAnomaliesAction',
          description: 'Return anomaly count.',
          defaultInput: '{}',
          onRun: (input) =>
            countInventoryAnomaliesAction(
              input as Parameters<typeof countInventoryAnomaliesAction>[0],
            ),
        },
      ],
    },
    {
      key: 'bulk-pricing',
      title: 'Bulk Pricing Jobs',
      description: 'Create, preview, count, inspect, and export bulk pricing jobs.',
      actions: [
        {
          key: 'create-bulk-pricing-job',
          title: 'createBulkPricingJobAction',
          description: 'Create a bulk pricing job.',
          defaultInput:
            '{"filters":{},"pricing":{"mode":"match_market"},"isPreview":false}',
          onRun: (input) =>
            createBulkPricingJobAction(
              input as Parameters<typeof createBulkPricingJobAction>[0],
            ),
        },
        {
          key: 'count-bulk-pricing',
          title: 'countBulkPricingAction',
          description: 'Count matches for bulk pricing settings.',
          defaultInput: '{"filters":{},"pricing":{"mode":"match_market"}}',
          onRun: (input) =>
            countBulkPricingAction(input as Parameters<typeof countBulkPricingAction>[0]),
        },
        {
          key: 'preview-bulk-pricing',
          title: 'previewBulkPricingAction',
          description: 'Preview bulk pricing updates.',
          defaultInput: '{"filters":{},"pricing":{"mode":"match_market"}}',
          onRun: (input) =>
            previewBulkPricingAction(input as Parameters<typeof previewBulkPricingAction>[0]),
        },
        {
          key: 'list-bulk-pricing-jobs',
          title: 'listBulkPricingJobsAction',
          description: 'List bulk pricing jobs.',
          defaultInput: '{"limit":25,"offset":0}',
          onRun: (input) =>
            listBulkPricingJobsAction(
              input as Parameters<typeof listBulkPricingJobsAction>[0],
            ),
        },
        {
          key: 'get-bulk-pricing-job',
          title: 'getBulkPricingJobAction',
          description: 'Get one bulk pricing job by ID.',
          defaultInput: '{"jobId":"job-id"}',
          onRun: (input) =>
            getBulkPricingJobAction(input as Parameters<typeof getBulkPricingJobAction>[0]),
        },
        {
          key: 'get-recent-bulk-pricing-job',
          title: 'getRecentBulkPricingJobAction',
          description: 'Get most recent bulk pricing job.',
          defaultInput: '{}',
          onRun: (input) =>
            getRecentBulkPricingJobAction(
              input as Parameters<typeof getRecentBulkPricingJobAction>[0],
            ),
        },
        {
          key: 'export-bulk-pricing-job-csv',
          title: 'exportBulkPricingJobCsvAction',
          description: 'Export one bulk pricing job as CSV.',
          defaultInput: '{"jobId":"job-id"}',
          onRun: (input) =>
            exportBulkPricingJobCsvAction(
              input as Parameters<typeof exportBulkPricingJobCsvAction>[0],
            ),
        },
      ],
    },
    {
      key: 'orders',
      title: 'Seller Orders',
      description: 'List and manage seller orders and fulfillment updates.',
      actions: [
        {
          key: 'list-seller-orders',
          title: 'listSellerOrdersAction',
          description: 'List seller orders.',
          defaultInput: '{"limit":25,"offset":0}',
          onRun: (input) =>
            listSellerOrdersAction(input as Parameters<typeof listSellerOrdersAction>[0]),
        },
        {
          key: 'get-seller-order',
          title: 'getSellerOrderAction',
          description: 'Get one seller order by ManaPool order ID.',
          defaultInput: '{"orderId":"order-id"}',
          onRun: (input) =>
            getSellerOrderAction(input as Parameters<typeof getSellerOrderAction>[0]),
        },
        {
          key: 'upsert-seller-order-fulfillment',
          title: 'upsertSellerOrderFulfillmentAction',
          description: 'Update seller fulfillment status and tracking metadata.',
          defaultInput:
            '{"orderId":"order-id","status":"shipped","trackingCompany":"USPS","trackingNumber":"9400111899223856999999"}',
          onRun: (input) =>
            upsertSellerOrderFulfillmentAction(
              input as Parameters<typeof upsertSellerOrderFulfillmentAction>[0],
            ),
        },
        {
          key: 'get-seller-order-reports',
          title: 'getSellerOrderReportsAction',
          description: 'Fetch order reports for a ManaPool order ID.',
          defaultInput: '{"orderId":"order-id"}',
          onRun: (input) =>
            getSellerOrderReportsAction(
              input as Parameters<typeof getSellerOrderReportsAction>[0],
            ),
        },
      ],
    },
    {
      key: 'webhooks',
      title: 'Webhooks',
      description: 'Manage registered ManaPool webhooks from the UI.',
      actions: [
        {
          key: 'list-webhooks',
          title: 'listWebhooksAction',
          description: 'List registered webhooks.',
          defaultInput: '{"topic":"order_created"}',
          onRun: (input) =>
            listWebhooksAction(input as Parameters<typeof listWebhooksAction>[0]),
        },
        {
          key: 'get-webhook',
          title: 'getWebhookAction',
          description: 'Get webhook details by webhook ID.',
          defaultInput: '{"webhookId":"webhook-id"}',
          onRun: (input) => getWebhookAction(input as Parameters<typeof getWebhookAction>[0]),
        },
        {
          key: 'register-webhook',
          title: 'registerWebhookAction',
          description: 'Register an order_created webhook.',
          defaultInput:
            '{"topic":"order_created","callbackUrl":"https://example.com/webhooks/manapool"}',
          onRun: (input) =>
            registerWebhookAction(input as Parameters<typeof registerWebhookAction>[0]),
        },
        {
          key: 'delete-webhook',
          title: 'deleteWebhookAction',
          description: 'Delete a webhook by webhook ID.',
          defaultInput: '{"webhookId":"webhook-id"}',
          onRun: (input) =>
            deleteWebhookAction(input as Parameters<typeof deleteWebhookAction>[0]),
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
        <h1 className="text-3xl font-semibold">ManaPool Sandbox</h1>
        <p className="text-sm text-slate-600">
          This page exposes every public ManaPool Convex action. Edit JSON args, run
          actions, and inspect raw responses. Most seller actions require an authenticated
          user with admin role plus `MANAPOOL_EMAIL` and `MANAPOOL_ACCESS_TOKEN` configured.
        </p>
        <p className="text-sm text-slate-600">
          Internal webhook-processing and reconciliation actions are intentionally excluded
          from this UI because they are internal-only functions.
        </p>

        <SignedOut>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sign in as an admin user to run seller-authenticated ManaPool actions.
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

export default ManaPoolSandboxPage
