import { useState } from 'react'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'
import type { Id, TableNames } from '../../convex/_generated/dataModel'

type AddressForm = {
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  country: string
  name: string
  company: string
  phone: string
  email: string
}

type AddressVerificationState = {
  isVerified: boolean | null
  isVerificationOverridden: boolean
  verificationErrors: string[]
}

type AddressKind = 'from' | 'to'

type AddressFieldConfig = {
  key: keyof AddressForm
  label: string
  autoComplete: string
}

type AddressFormFieldsProps = {
  kind: AddressKind
  form: AddressForm
  onChange: (key: keyof AddressForm, value: string) => void
}

type JsonPanelProps = {
  title: string
  data: unknown
  maxHeightClass?: string
}

type AddressVerificationCardProps = {
  kind: AddressKind
  stepNumber: number
  form: AddressForm
  addressId: string
  parsedAddressId: Id<'addresses'> | null
  verification: AddressVerificationState
  isBusy: boolean
  canRunAuthedOperations: boolean
  onFormChange: (key: keyof AddressForm, value: string) => void
  onAddressIdChange: (value: string) => void
  onVerify: () => void
  onOverride: () => void
}

const defaultFromAddress: AddressForm = {
  street1: '417 Montgomery St',
  street2: '',
  city: 'San Francisco',
  state: 'CA',
  zip: '94104',
  country: 'US',
  name: 'Warehouse',
  company: 'TCG IMS',
  phone: '4150000000',
  email: 'shipping@example.com',
}

const defaultToAddress: AddressForm = {
  street1: '350 5th Ave',
  street2: '',
  city: 'New York',
  state: 'NY',
  zip: '10118',
  country: 'US',
  name: 'Test Customer',
  company: '',
  phone: '2120000000',
  email: 'customer@example.com',
}

const initialAddressVerificationState: AddressVerificationState = {
  isVerified: null,
  isVerificationOverridden: false,
  verificationErrors: [],
}

// TODO: Tighten this regex if Convex IDs use a fixed length or specific character set.
// Current pattern is a loose sanity check that accepts any alphanumeric string of 10+ chars.
const CONVEX_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/

const addressFields: AddressFieldConfig[] = [
  { key: 'street1', label: 'Street 1', autoComplete: 'address-line1' },
  { key: 'street2', label: 'Street 2', autoComplete: 'address-line2' },
  { key: 'city', label: 'City', autoComplete: 'address-level2' },
  { key: 'state', label: 'State', autoComplete: 'address-level1' },
  { key: 'zip', label: 'ZIP', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', autoComplete: 'country' },
  { key: 'name', label: 'Name', autoComplete: 'name' },
  { key: 'company', label: 'Company', autoComplete: 'organization' },
  { key: 'phone', label: 'Phone', autoComplete: 'tel' },
  { key: 'email', label: 'Email', autoComplete: 'email' },
]

function cleanOptional(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toConvexId<T extends TableNames>(value: string): Id<T> | null {
  const trimmed = value.trim()
  if (!CONVEX_ID_PATTERN.test(trimmed)) return null
  return trimmed as Id<T>
}

function requireConvexId<T extends TableNames>(value: string, fieldName: string): Id<T> {
  const id = toConvexId<T>(value)
  if (!id) throw new Error(`${fieldName} must be a valid Convex ID.`)
  return id
}

function formatInvalidAddressMessage(kind: AddressKind, errors: string[]) {
  const label = kind === 'from' ? 'From address' : 'To address'
  if (errors.length === 0) {
    return `${label} could not be verified by EasyPost. Correct the address or use override to continue.`
  }
  return `${label} failed verification: ${errors.join(', ')}`
}

// TODO: These regexes match current Convex action error wrapping formats
// ("Uncaught Error: ..." and "Server Error ..."). If Convex changes their
// error format the regexes will silently stop matching and we'll fall through
// to the raw message, which is fine — but worth knowing why these exist.
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

function AddressFormFields({ kind, form, onChange }: AddressFormFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {addressFields.map((field) => {
        const inputId = `${kind}-${field.key}`
        return (
          <div key={field.key} className="space-y-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor={inputId}>
              {field.label}
            </label>
            <input
              aria-label={`${kind} ${field.label}`}
              autoComplete={field.autoComplete}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              id={inputId}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.label}
              value={form[field.key]}
            />
          </div>
        )
      })}
    </div>
  )
}

function JsonPanel({ title, data, maxHeightClass = 'max-h-64' }: JsonPanelProps) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <pre
        className={`${maxHeightClass} overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100`}
      >
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </div>
  )
}

function AddressVerificationCard({
  kind,
  stepNumber,
  form,
  addressId,
  parsedAddressId,
  verification,
  isBusy,
  canRunAuthedOperations,
  onFormChange,
  onAddressIdChange,
  onVerify,
  onOverride,
}: AddressVerificationCardProps) {
  const kindLabel = kind === 'from' ? 'From' : 'To'
  const addressIdInputId = `${kind}-address-id`

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold">
        {stepNumber}) Verify {kindLabel} Address
      </h2>
      <AddressFormFields form={form} kind={kind} onChange={onFormChange} />
      <button
        className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={isBusy || !canRunAuthedOperations}
        onClick={onVerify}
        type="button"
      >
        Verify {kindLabel} Address
      </button>
      {verification.isVerified === true && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {kindLabel} address is verified.
        </p>
      )}
      {verification.isVerified === false && (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{formatInvalidAddressMessage(kind, verification.verificationErrors)}</p>
          {verification.isVerificationOverridden ? (
            <p className="font-medium">Verification override enabled for this address.</p>
          ) : (
            <button
              className="rounded bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={isBusy || !canRunAuthedOperations}
              onClick={onOverride}
              type="button"
            >
              Override And Continue
            </button>
          )}
        </div>
      )}
      <div className="space-y-1">
        <label
          className="block text-xs font-medium text-slate-700"
          htmlFor={addressIdInputId}
        >
          {kindLabel} Address ID
        </label>
        <input
          aria-label={`${kindLabel} Address ID`}
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          id={addressIdInputId}
          onChange={(e) => onAddressIdChange(e.target.value)}
          placeholder={`${kindLabel} address Convex ID`}
          value={addressId}
        />
        {addressId.trim() && !parsedAddressId && (
          <p className="text-xs text-amber-700">
            ID format is invalid. Actions will be blocked until fixed.
          </p>
        )}
      </div>
    </div>
  )
}

function EasyPostSandboxPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const verifyAndSaveAddress = useAction(api.shipping.actions.verifyAndSaveAddress)
  const overrideAddressVerification = useAction(
    api.shipping.actions.overrideAddressVerification,
  )
  const purchaseLabel = useAction(api.shipping.actions.purchaseLabel)
  const voidLabel = useAction(api.shipping.actions.voidLabel)

  const [fromAddressForm, setFromAddressForm] = useState(defaultFromAddress)
  const [toAddressForm, setToAddressForm] = useState(defaultToAddress)
  const [fromAddressId, setFromAddressId] = useState('')
  const [toAddressId, setToAddressId] = useState('')
  const [fromAddressVerification, setFromAddressVerification] = useState(
    initialAddressVerificationState,
  )
  const [toAddressVerification, setToAddressVerification] = useState(
    initialAddressVerificationState,
  )
  const [orderId, setOrderId] = useState('')
  const [serviceLevel, setServiceLevel] = useState('Priority')
  const [parcelLength, setParcelLength] = useState('10')
  const [parcelWidth, setParcelWidth] = useState('8')
  const [parcelHeight, setParcelHeight] = useState('2')
  const [parcelWeight, setParcelWeight] = useState('12')
  const [shipmentId, setShipmentId] = useState('')
  const [busyCount, setBusyCount] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const canRunAuthedOperations = isAuthenticated && !isLoading
  const isBusy = busyCount > 0

  const parsedOrderId = toConvexId<'orders'>(orderId)
  const parsedShipmentId = toConvexId<'shipments'>(shipmentId)
  const parsedFromAddressId = toConvexId<'addresses'>(fromAddressId)
  const parsedToAddressId = toConvexId<'addresses'>(toAddressId)

  const orderShipments = useQuery(
    api.shipping.queries.listShipmentsByOrder,
    canRunAuthedOperations && parsedOrderId ? { orderId: parsedOrderId } : 'skip',
  )
  const shipment = useQuery(
    api.shipping.queries.getShipment,
    canRunAuthedOperations && parsedShipmentId
      ? { shipmentId: parsedShipmentId }
      : 'skip',
  )
  const trackingEvents = useQuery(
    api.shipping.queries.listTrackingEvents,
    canRunAuthedOperations && parsedShipmentId
      ? { shipmentId: parsedShipmentId }
      : 'skip',
  )
  const refund = useQuery(
    api.shipping.queries.getRefundByShipment,
    canRunAuthedOperations && parsedShipmentId
      ? { shipmentId: parsedShipmentId }
      : 'skip',
  )

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyCount((prev) => prev + 1)
    setErrorMessage(null)
    setStatusMessage(`Running: ${name}`)
    try {
      if (!canRunAuthedOperations) {
        throw new Error('Authentication is still loading. Please retry in a moment.')
      }
      await fn()
      setStatusMessage(`Success: ${name}`)
    } catch (err) {
      setErrorMessage(extractActionErrorMessage(err))
      setStatusMessage(`Failed: ${name}`)
    } finally {
      setBusyCount((prev) => Math.max(0, prev - 1))
    }
  }

  const runClickHandler = (action: () => Promise<void>) => {
    return () => {
      action().catch((err) => {
        console.error('Unhandled sandbox action error', err)
        setErrorMessage(extractActionErrorMessage(err))
        setStatusMessage('Failed: client-side action')
      })
    }
  }

  const verifyAddress = async (kind: AddressKind) => {
    const form = kind === 'from' ? fromAddressForm : toAddressForm
    await runAction(`verify ${kind} address`, async () => {
      const result = await verifyAndSaveAddress({
        street1: form.street1,
        street2: cleanOptional(form.street2),
        city: form.city,
        state: form.state,
        zip: form.zip,
        country: form.country,
        name: cleanOptional(form.name),
        company: cleanOptional(form.company),
        phone: cleanOptional(form.phone),
        email: cleanOptional(form.email),
      })
      if (kind === 'from') {
        setFromAddressId(result.addressId)
        setFromAddressVerification({
          isVerified: result.isVerified,
          isVerificationOverridden: false,
          verificationErrors: result.verificationErrors,
        })
      } else {
        setToAddressId(result.addressId)
        setToAddressVerification({
          isVerified: result.isVerified,
          isVerificationOverridden: false,
          verificationErrors: result.verificationErrors,
        })
      }
      if (!result.isVerified) {
        setErrorMessage(formatInvalidAddressMessage(kind, result.verificationErrors))
      }
    })
  }

  const handleAddressOverride = async (kind: AddressKind) => {
    await runAction(`override ${kind} address validation`, async () => {
      const addressId = kind === 'from' ? fromAddressId : toAddressId

      const result = await overrideAddressVerification({
        addressId: requireConvexId<'addresses'>(
          addressId,
          kind === 'from' ? 'From address ID' : 'To address ID',
        ),
      })

      const nextState: AddressVerificationState = {
        isVerified: result.isVerified,
        isVerificationOverridden: result.isVerificationOverridden,
        verificationErrors: result.verificationErrors,
      }

      if (kind === 'from') {
        setFromAddressVerification(nextState)
      } else {
        setToAddressVerification(nextState)
      }
    })
  }

  const handlePurchase = async () => {
    await runAction('purchase label', async () => {
      const length = Number(parcelLength)
      const width = Number(parcelWidth)
      const height = Number(parcelHeight)
      const weight = Number(parcelWeight)
      if (!Number.isFinite(length) || length <= 0) throw new Error('Invalid parcel length')
      if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid parcel width')
      if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid parcel height')
      if (!Number.isFinite(weight) || weight <= 0) throw new Error('Invalid parcel weight')

      const result = await purchaseLabel({
        orderId: requireConvexId<'orders'>(orderId, 'Order ID'),
        fromAddressId: requireConvexId<'addresses'>(fromAddressId, 'From address ID'),
        toAddressId: requireConvexId<'addresses'>(toAddressId, 'To address ID'),
        parcelLength: length,
        parcelWidth: width,
        parcelHeight: height,
        parcelWeight: weight,
        serviceLevel,
      })
      setShipmentId(result.shipmentId)
    })
  }

  const handleVoid = async () => {
    await runAction('void label', async () => {
      await voidLabel({
        shipmentId: requireConvexId<'shipments'>(shipmentId, 'Shipment ID'),
      })
    })
  }

  const updateAddressForm = (kind: AddressKind, key: keyof AddressForm, value: string) => {
    if (kind === 'from') {
      setFromAddressForm((prev) => ({ ...prev, [key]: value }))
    } else {
      setToAddressForm((prev) => ({ ...prev, [key]: value }))
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
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
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <h1 className="text-3xl font-semibold">Temporary EasyPost Sandbox</h1>
            <p className="text-sm text-slate-600">
              Use this page to manually test address verification, label purchase, voids,
              and webhook-driven tracking state. If EasyPost marks an address invalid,
              verify manually and use override to continue.
            </p>

            {statusMessage && (
              <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {statusMessage}
              </p>
            )}
            {errorMessage && (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorMessage}
              </p>
            )}

            <section className="grid gap-4 md:grid-cols-2">
              <AddressVerificationCard
                addressId={fromAddressId}
                canRunAuthedOperations={canRunAuthedOperations}
                form={fromAddressForm}
                isBusy={isBusy}
                kind="from"
                onAddressIdChange={setFromAddressId}
                onFormChange={(key, value) => updateAddressForm('from', key, value)}
                onOverride={runClickHandler(() => handleAddressOverride('from'))}
                onVerify={runClickHandler(() => verifyAddress('from'))}
                parsedAddressId={parsedFromAddressId}
                stepNumber={1}
                verification={fromAddressVerification}
              />
              <AddressVerificationCard
                addressId={toAddressId}
                canRunAuthedOperations={canRunAuthedOperations}
                form={toAddressForm}
                isBusy={isBusy}
                kind="to"
                onAddressIdChange={setToAddressId}
                onFormChange={(key, value) => updateAddressForm('to', key, value)}
                onOverride={runClickHandler(() => handleAddressOverride('to'))}
                onVerify={runClickHandler(() => verifyAddress('to'))}
                parsedAddressId={parsedToAddressId}
                stepNumber={2}
                verification={toAddressVerification}
              />
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold">3) Purchase / Void Label</h2>
              <p className="text-sm text-slate-600">
                Enter an existing Order ID from your Convex `orders` table.
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-1">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="order-id"
                  >
                    Order ID
                  </label>
                  <input
                    aria-label="Order ID"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="order-id"
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="Order Convex ID"
                    value={orderId}
                  />
                  {orderId.trim() && !parsedOrderId && (
                    <p className="text-xs text-amber-700">
                      Invalid ID format. Order-based queries are currently skipped.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="service-level"
                  >
                    Service Level
                  </label>
                  <input
                    aria-label="Service level"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="service-level"
                    onChange={(e) => setServiceLevel(e.target.value)}
                    placeholder="Priority, First..."
                    value={serviceLevel}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="shipment-id"
                  >
                    Shipment ID
                  </label>
                  <input
                    aria-label="Shipment ID"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="shipment-id"
                    onChange={(e) => setShipmentId(e.target.value)}
                    placeholder="Shipment Convex ID (inspect/void)"
                    value={shipmentId}
                  />
                  {shipmentId.trim() && !parsedShipmentId && (
                    <p className="text-xs text-amber-700">
                      Invalid ID format. Shipment queries are currently skipped.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="parcel-length"
                  >
                    Parcel Length
                  </label>
                  <input
                    aria-label="Parcel length"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="parcel-length"
                    onChange={(e) => setParcelLength(e.target.value)}
                    placeholder="Parcel length"
                    value={parcelLength}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="parcel-width"
                  >
                    Parcel Width
                  </label>
                  <input
                    aria-label="Parcel width"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="parcel-width"
                    onChange={(e) => setParcelWidth(e.target.value)}
                    placeholder="Parcel width"
                    value={parcelWidth}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="parcel-height"
                  >
                    Parcel Height
                  </label>
                  <input
                    aria-label="Parcel height"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="parcel-height"
                    onChange={(e) => setParcelHeight(e.target.value)}
                    placeholder="Parcel height"
                    value={parcelHeight}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <label
                    className="block text-xs font-medium text-slate-700"
                    htmlFor="parcel-weight"
                  >
                    Parcel Weight (ounces)
                  </label>
                  <input
                    aria-label="Parcel weight"
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    id="parcel-weight"
                    onChange={(e) => setParcelWeight(e.target.value)}
                    placeholder="Parcel weight (ounces)"
                    value={parcelWeight}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={isBusy || !canRunAuthedOperations}
                  onClick={runClickHandler(handlePurchase)}
                  type="button"
                >
                  Purchase Label
                </button>
                <button
                  className="rounded bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={isBusy || !canRunAuthedOperations}
                  onClick={runClickHandler(handleVoid)}
                  type="button"
                >
                  Void Label
                </button>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <JsonPanel data={orderShipments} title="Shipments By Order" />
              <JsonPanel data={shipment} title="Shipment" />
              <JsonPanel data={refund} title="Refund" />
            </section>

            <JsonPanel data={trackingEvents} maxHeightClass="max-h-72" title="Tracking Events" />
          </div>
        </SignedIn>
      </section>
    </main>
  )
}

export default EasyPostSandboxPage
