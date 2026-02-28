import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  useAuth,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'

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

function cleanOptional(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function App() {
  const { isSignedIn } = useAuth()
  const verifyAndSaveAddress = useAction(api.shipping.actions.verifyAndSaveAddress)
  const purchaseLabel = useAction(api.shipping.actions.purchaseLabel)
  const voidLabel = useAction(api.shipping.actions.voidLabel)
  const createTestOrder = useMutation(api.order.mutations.createTestOrder)

  const [fromAddressForm, setFromAddressForm] = useState(defaultFromAddress)
  const [toAddressForm, setToAddressForm] = useState(defaultToAddress)
  const [fromAddressId, setFromAddressId] = useState('')
  const [toAddressId, setToAddressId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [serviceLevel, setServiceLevel] = useState('Priority')
  const [parcelLength, setParcelLength] = useState('10')
  const [parcelWidth, setParcelWidth] = useState('8')
  const [parcelHeight, setParcelHeight] = useState('2')
  const [parcelWeight, setParcelWeight] = useState('12')
  const [shipmentId, setShipmentId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const orderShipments = useQuery(
    api.shipping.queries.listShipmentsByOrder,
    isSignedIn && orderId.trim()
      ? { orderId: orderId.trim() as Id<'orders'> }
      : 'skip',
  )
  const shipment = useQuery(
    api.shipping.queries.getShipment,
    isSignedIn && shipmentId.trim()
      ? { shipmentId: shipmentId.trim() as Id<'shipments'> }
      : 'skip',
  )
  const trackingEvents = useQuery(
    api.shipping.queries.listTrackingEvents,
    isSignedIn && shipmentId.trim()
      ? { shipmentId: shipmentId.trim() as Id<'shipments'> }
      : 'skip',
  )
  const refund = useQuery(
    api.shipping.queries.getRefundByShipment,
    isSignedIn && shipmentId.trim()
      ? { shipmentId: shipmentId.trim() as Id<'shipments'> }
      : 'skip',
  )

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name)
    setErrorMessage(null)
    setStatusMessage(`Running: ${name}`)
    try {
      await fn()
      setStatusMessage(`Success: ${name}`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setStatusMessage(`Failed: ${name}`)
    } finally {
      setBusyAction('')
    }
  }

  const verifyAddress = async (kind: 'from' | 'to') => {
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
      } else {
        setToAddressId(result.addressId)
      }
      if (!result.isVerified && result.verificationErrors.length > 0) {
        setErrorMessage(
          `${kind} address verification warnings: ${result.verificationErrors.join(', ')}`,
        )
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
      if (!orderId.trim()) throw new Error('Order ID is required')
      if (!fromAddressId.trim()) throw new Error('From address ID is required')
      if (!toAddressId.trim()) throw new Error('To address ID is required')

      const result = await purchaseLabel({
        orderId: orderId.trim() as Id<'orders'>,
        fromAddressId: fromAddressId.trim() as Id<'addresses'>,
        toAddressId: toAddressId.trim() as Id<'addresses'>,
        parcelLength: length,
        parcelWidth: width,
        parcelHeight: height,
        parcelWeight: weight,
        serviceLevel,
      })
      setShipmentId(result.shipmentId)
    })
  }

  const handleCreateTestOrder = async () => {
    await runAction('create test order', async () => {
      const id = await createTestOrder({ status: 'test' })
      setOrderId(id)
    })
  }

  const handleVoid = async () => {
    await runAction('void label', async () => {
      if (!shipmentId.trim()) throw new Error('Shipment ID is required')
      await voidLabel({ shipmentId: shipmentId.trim() as Id<'shipments'> })
    })
  }

  const updateAddressForm = (
    kind: 'from' | 'to',
    key: keyof AddressForm,
    value: string,
  ) => {
    if (kind === 'from') {
      setFromAddressForm((prev) => ({ ...prev, [key]: value }))
    } else {
      setToAddressForm((prev) => ({ ...prev, [key]: value }))
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
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
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <h1 className="text-3xl font-semibold">Temporary EasyPost Sandbox</h1>
            <p className="text-sm text-slate-600">
              Use this page to manually test address verification, label purchase, voids,
              and webhook-driven tracking state.
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
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold">1) Verify From Address</h2>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.street1}
                    onChange={(e) =>
                      updateAddressForm('from', 'street1', e.target.value)
                    }
                    placeholder="street1"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.street2}
                    onChange={(e) =>
                      updateAddressForm('from', 'street2', e.target.value)
                    }
                    placeholder="street2"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.city}
                    onChange={(e) => updateAddressForm('from', 'city', e.target.value)}
                    placeholder="city"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.state}
                    onChange={(e) => updateAddressForm('from', 'state', e.target.value)}
                    placeholder="state"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.zip}
                    onChange={(e) => updateAddressForm('from', 'zip', e.target.value)}
                    placeholder="zip"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.country}
                    onChange={(e) =>
                      updateAddressForm('from', 'country', e.target.value)
                    }
                    placeholder="country"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.name}
                    onChange={(e) => updateAddressForm('from', 'name', e.target.value)}
                    placeholder="name"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.company}
                    onChange={(e) =>
                      updateAddressForm('from', 'company', e.target.value)
                    }
                    placeholder="company"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.phone}
                    onChange={(e) => updateAddressForm('from', 'phone', e.target.value)}
                    placeholder="phone"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={fromAddressForm.email}
                    onChange={(e) => updateAddressForm('from', 'email', e.target.value)}
                    placeholder="email"
                  />
                </div>
                <button
                  className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busyAction.length > 0}
                  onClick={() => void verifyAddress('from')}
                >
                  Verify From Address
                </button>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={fromAddressId}
                  onChange={(e) => setFromAddressId(e.target.value)}
                  placeholder="fromAddressId"
                />
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold">2) Verify To Address</h2>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.street1}
                    onChange={(e) => updateAddressForm('to', 'street1', e.target.value)}
                    placeholder="street1"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.street2}
                    onChange={(e) => updateAddressForm('to', 'street2', e.target.value)}
                    placeholder="street2"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.city}
                    onChange={(e) => updateAddressForm('to', 'city', e.target.value)}
                    placeholder="city"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.state}
                    onChange={(e) => updateAddressForm('to', 'state', e.target.value)}
                    placeholder="state"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.zip}
                    onChange={(e) => updateAddressForm('to', 'zip', e.target.value)}
                    placeholder="zip"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.country}
                    onChange={(e) => updateAddressForm('to', 'country', e.target.value)}
                    placeholder="country"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.name}
                    onChange={(e) => updateAddressForm('to', 'name', e.target.value)}
                    placeholder="name"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.company}
                    onChange={(e) => updateAddressForm('to', 'company', e.target.value)}
                    placeholder="company"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.phone}
                    onChange={(e) => updateAddressForm('to', 'phone', e.target.value)}
                    placeholder="phone"
                  />
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={toAddressForm.email}
                    onChange={(e) => updateAddressForm('to', 'email', e.target.value)}
                    placeholder="email"
                  />
                </div>
                <button
                  className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busyAction.length > 0}
                  onClick={() => void verifyAddress('to')}
                >
                  Verify To Address
                </button>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={toAddressId}
                  onChange={(e) => setToAddressId(e.target.value)}
                  placeholder="toAddressId"
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold">3) Purchase / Void Label</h2>
              <p className="text-sm text-slate-600">
                Enter an existing Order ID from your Convex `orders` table.
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="orderId"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={serviceLevel}
                  onChange={(e) => setServiceLevel(e.target.value)}
                  placeholder="service level (Priority, First...)"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={shipmentId}
                  onChange={(e) => setShipmentId(e.target.value)}
                  placeholder="shipmentId (for inspect/void)"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={parcelLength}
                  onChange={(e) => setParcelLength(e.target.value)}
                  placeholder="parcel length"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={parcelWidth}
                  onChange={(e) => setParcelWidth(e.target.value)}
                  placeholder="parcel width"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={parcelHeight}
                  onChange={(e) => setParcelHeight(e.target.value)}
                  placeholder="parcel height"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm md:col-span-3"
                  value={parcelWeight}
                  onChange={(e) => setParcelWeight(e.target.value)}
                  placeholder="parcel weight (ounces)"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busyAction.length > 0}
                  onClick={() => void handleCreateTestOrder()}
                >
                  Create Test Order
                </button>
                <button
                  className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busyAction.length > 0}
                  onClick={() => void handlePurchase()}
                >
                  Purchase Label
                </button>
                <button
                  className="rounded bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busyAction.length > 0}
                  onClick={() => void handleVoid()}
                >
                  Void Label
                </button>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-semibold">Shipments By Order</h3>
                <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(orderShipments ?? null, null, 2)}
                </pre>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-semibold">Shipment</h3>
                <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(shipment ?? null, null, 2)}
                </pre>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-semibold">Refund</h3>
                <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(refund ?? null, null, 2)}
                </pre>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold">Tracking Events</h3>
              <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                {JSON.stringify(trackingEvents ?? null, null, 2)}
              </pre>
            </section>
          </div>
        </SignedIn>
      </section>
    </main>
  )
}

export default App
