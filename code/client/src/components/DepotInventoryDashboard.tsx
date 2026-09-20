import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export interface InventoryItem {
  _id: string;
  resource: {
    _id: string;
    name: string;
    category: string;
    unit: string;
    description?: string;
    isPerishable?: boolean;
  };
  organization?: {
    _id: string;
    name: string;
    type: string;
    operatingRegion?: string;
  };
  ownerType: 'User' | 'Organization';
  ownerId: string;
  quantityAvailable: number;
  quantityReserved: number;
  location?: {
    lat?: number;
    lng?: number;
    address?: string;
  };
  status: 'available' | 'reserved' | 'depleted' | 'damaged' | 'expired';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'all' | 'available' | 'reserved' | 'depleted';

function getStatusBadge(status: InventoryItem['status']) {
  switch (status) {
    case 'available':
      return {
        label: 'AVAILABLE',
        border: 'border-l-teal',
        text: 'text-teal',
        bg: 'bg-teal/10',
      };
    case 'reserved':
      return {
        label: 'RESERVED',
        border: 'border-l-amber',
        text: 'text-amber',
        bg: 'bg-amber/10',
      };
    case 'depleted':
    case 'damaged':
    case 'expired':
      return {
        label: status.toUpperCase(),
        border: 'border-l-rust',
        text: 'text-rust',
        bg: 'bg-rust/10',
      };
    default:
      return {
        label: String(status).toUpperCase(),
        border: 'border-l-slate',
        text: 'text-slate',
        bg: 'bg-slate/10',
      };
  }
}

export default function DepotInventoryDashboard() {
  const { token, user } = useAuth();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Register New Resource Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [registerName, setRegisterName] = useState<string>('');
  const [registerCategory, setRegisterCategory] = useState<string>('supplies');
  const [registerUnit, setRegisterUnit] = useState<string>('units');
  const [registerDescription, setRegisterDescription] = useState<string>('');
  const [registerIsPerishable, setRegisterIsPerishable] = useState<boolean>(false);
  const [registerInitialQty, setRegisterInitialQty] = useState<string>('10');
  const [registerLocation, setRegisterLocation] = useState<string>('');
  const [registerNotes, setRegisterNotes] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // Reserve / Release Modal or Drawer State
  const [activeActionItem, setActiveActionItem] = useState<InventoryItem | null>(null);
  const [actionType, setActionType] = useState<'reserve' | 'release' | null>(null);
  const [actionQty, setActionQty] = useState<string>('1');
  const [isActionSubmitting, setIsActionSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch Inventory from API
  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const query = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/inventory${query}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve depot inventory.');
      }

      setInventory(data.inventory || []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Error retrieving inventory records.');
    } finally {
      setIsLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Handle Reserve or Release Submission
  const handleReserveOrRelease = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !activeActionItem || !actionType) return;

    const qty = Number(actionQty);
    if (isNaN(qty) || qty <= 0) {
      setActionError('Quantity must be a positive integer.');
      return;
    }

    if (actionType === 'reserve' && qty > activeActionItem.quantityAvailable) {
      setActionError(`Cannot reserve more than ${activeActionItem.quantityAvailable} available units.`);
      return;
    }

    if (actionType === 'release' && qty > activeActionItem.quantityReserved) {
      setActionError(`Cannot release more than ${activeActionItem.quantityReserved} reserved units.`);
      return;
    }

    setIsActionSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const endpoint = `/api/inventory/${activeActionItem._id}/${actionType}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quantity: qty }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${actionType} inventory.`);
      }

      const updatedInventory: InventoryItem = data.inventory;

      // Update in-memory state immediately without requiring full reload
      setInventory((prev) =>
        prev.map((item) =>
          item._id === updatedInventory._id
            ? {
                ...item,
                quantityAvailable: updatedInventory.quantityAvailable,
                quantityReserved: updatedInventory.quantityReserved,
                status: updatedInventory.status,
              }
            : item
        )
      );

      setActionSuccess(
        actionType === 'reserve'
          ? `Successfully reserved ${qty} unit(s) of ${activeActionItem.resource?.name || 'item'}.`
          : `Successfully released ${qty} unit(s) of ${activeActionItem.resource?.name || 'item'} back to stock.`
      );

      // Close modal after brief feedback
      setTimeout(() => {
        setActiveActionItem(null);
        setActionType(null);
        setActionQty('1');
        setActionSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : `Error executing ${actionType}.`);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Handle New Catalog Item Submission (POST /api/resources)
  const handleRegisterResource = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!registerName.trim()) {
      setRegisterError('Resource item name is required.');
      return;
    }

    const initialQty = Number(registerInitialQty);
    if (isNaN(initialQty) || initialQty < 0) {
      setRegisterError('Initial quantity must be a non-negative number.');
      return;
    }

    setIsRegistering(true);
    setRegisterError(null);
    setRegisterSuccess(null);

    try {
      const payload: Record<string, unknown> = {
        name: registerName.trim(),
        category: registerCategory.trim().toLowerCase(),
        unit: registerUnit.trim().toLowerCase(),
        description: registerDescription.trim() || undefined,
        isPerishable: registerIsPerishable,
        initialQuantity: initialQty,
        location: registerLocation.trim() ? { address: registerLocation.trim() } : undefined,
        notes: registerNotes.trim() || undefined,
      };

      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register catalog resource.');
      }

      setRegisterSuccess(
        `Resource "${registerName.trim()}" registered successfully with ${initialQty} ${registerUnit} in stock.`
      );

      // Refresh inventory list to get full populated records
      await fetchInventory();

      // Reset form fields
      setRegisterName('');
      setRegisterCategory('supplies');
      setRegisterUnit('units');
      setRegisterDescription('');
      setRegisterIsPerishable(false);
      setRegisterInitialQty('10');
      setRegisterLocation('');
      setRegisterNotes('');

      // Auto close modal after brief delay
      setTimeout(() => {
        setIsRegisterOpen(false);
        setRegisterSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setRegisterError(err instanceof Error ? err.message : 'Error registering new resource.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Filtered inventory based on search query
  const filteredInventory = inventory.filter((item) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = item.resource?.name?.toLowerCase().includes(term);
    const catMatch = item.resource?.category?.toLowerCase().includes(term);
    const orgMatch = item.organization?.name?.toLowerCase().includes(term);
    const locMatch = item.location?.address?.toLowerCase().includes(term);
    return nameMatch || catMatch || orgMatch || locMatch;
  });

  // Calculate high-level summary metrics
  const totalItemsCount = inventory.length;
  const totalUnitsAvailable = inventory.reduce((sum, item) => sum + (item.quantityAvailable || 0), 0);
  const totalUnitsReserved = inventory.reduce((sum, item) => sum + (item.quantityReserved || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Metric Summary Cards matching Field Ops Ledger (§01 / §02) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Registered Catalog SKUs
          </div>
          <div className="font-mono text-2xl font-bold text-ink">
            {totalItemsCount < 10 ? `0${totalItemsCount}` : totalItemsCount}
          </div>
        </div>

        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Total Units Available
          </div>
          <div className="font-mono text-2xl font-bold text-teal">
            {totalUnitsAvailable}
          </div>
        </div>

        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Total Units Reserved
          </div>
          <div className="font-mono text-2xl font-bold text-amber">
            {totalUnitsReserved}
          </div>
        </div>
      </div>

      {/* Global Ledger Actions & Filter Bar matching §06 / §07 Field Ops Ledger */}
      <div className="p-3 bg-paper-raised border border-slate-line flex flex-wrap items-center justify-between gap-3">
        {/* Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="text-slate uppercase mr-1">Stock Status:</span>
          {(['all', 'available', 'reserved', 'depleted'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 border transition-colors cursor-pointer uppercase font-mono text-[11px] ${
                statusFilter === status
                  ? 'bg-ink text-white border-ink font-semibold'
                  : 'bg-paper text-slate border-slate-line hover:border-ink'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Right Actions: Search + Register Button + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter item name or category..."
            className="bg-white border border-slate-line px-2.5 py-1 text-xs text-ink font-sans outline-none w-48 sm:w-60"
          />

          <button
            type="button"
            onClick={fetchInventory}
            disabled={isLoading}
            className="font-mono text-[11px] text-slate hover:text-ink border border-slate-line bg-paper px-2.5 py-1 cursor-pointer uppercase disabled:opacity-50"
          >
            {isLoading ? 'Syncing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegisterOpen(true);
              setRegisterError(null);
              setRegisterSuccess(null);
            }}
            className="bg-ink text-white font-sans text-xs font-semibold px-3.5 py-1 rounded-[3px] hover:bg-ink-soft cursor-pointer"
          >
            + Register Resource
          </button>
        </div>
      </div>

      {/* Error Banners */}
      {fetchError && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          DEPOT ERROR: {fetchError}
        </div>
      )}

      {/* Registration Modal Form */}
      {isRegisterOpen && (
        <div className="border border-slate-line bg-paper-raised p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-line pb-2">
            <div className="font-mono text-xs font-bold text-ink uppercase tracking-wider">
              Register New Catalog Resource & Initial Inventory
            </div>
            <button
              type="button"
              onClick={() => setIsRegisterOpen(false)}
              className="font-mono text-xs text-slate hover:text-ink px-1.5 py-0.5 border border-slate-line cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          {registerError && (
            <div className="p-2 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
              REGISTRATION ERROR: {registerError}
            </div>
          )}

          {registerSuccess && (
            <div className="p-2 bg-teal/10 border border-teal/40 font-mono text-xs text-teal font-medium">
              {registerSuccess}
            </div>
          )}

          <form onSubmit={handleRegisterResource} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="e.g. Sterile Trauma Bandages"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Category *
                </label>
                <select
                  value={registerCategory}
                  onChange={(e) => setRegisterCategory(e.target.value)}
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                >
                  <option value="supplies">Supplies</option>
                  <option value="medical">Medical</option>
                  <option value="water">Water</option>
                  <option value="food">Food</option>
                  <option value="shelter">Shelter</option>
                  <option value="rescue">Rescue Equipment</option>
                  <option value="equipment">Heavy Equipment</option>
                  <option value="hygiene">Hygiene</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Unit of Measure *
                </label>
                <input
                  type="text"
                  required
                  value={registerUnit}
                  onChange={(e) => setRegisterUnit(e.target.value)}
                  placeholder="e.g. crates, boxes, kits, units"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Initial Stock Quantity *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={registerInitialQty}
                  onChange={(e) => setRegisterInitialQty(e.target.value)}
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Depot / Storage Location
                </label>
                <input
                  type="text"
                  value={registerLocation}
                  onChange={(e) => setRegisterLocation(e.target.value)}
                  placeholder="e.g. Northern Relief Warehouse, Bay 4"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={registerIsPerishable}
                    onChange={(e) => setRegisterIsPerishable(e.target.checked)}
                    className="w-4 h-4 text-ink accent-ink"
                  />
                  <span>Perishable Commodity (Has Expiry)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                Item Description (Optional)
              </label>
              <input
                type="text"
                value={registerDescription}
                onChange={(e) => setRegisterDescription(e.target.value)}
                placeholder="Technical specifications, capacity, or kit contents"
                className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-line">
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="font-mono text-xs text-slate hover:text-ink px-3 py-1.5 border border-slate-line bg-paper cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRegistering}
                className="bg-ink text-white font-sans text-xs font-semibold px-4 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
              >
                {isRegistering ? 'Registering...' : 'Register catalog resource'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reserve / Release Action Form (Inline Drawer) */}
      {activeActionItem && actionType && (
        <div className="border border-slate-line bg-paper p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-line pb-2">
            <div className="font-mono text-xs font-bold text-ink uppercase tracking-wider">
              {actionType === 'reserve' ? 'Reserve Stock For Mission' : 'Release Reserved Stock Back To Available'}
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveActionItem(null);
                setActionType(null);
              }}
              className="font-mono text-xs text-slate hover:text-ink px-1.5 py-0.5 border border-slate-line cursor-pointer"
            >
              ✕ Cancel
            </button>
          </div>

          <div className="p-2.5 bg-paper-raised border border-slate-line font-mono text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-ink">{activeActionItem.resource?.name}</span>
              <span className="text-slate ml-2">
                [{activeActionItem.resource?.category || 'supplies'}]
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span>
                Available: <strong className="text-teal">{activeActionItem.quantityAvailable}</strong> {activeActionItem.resource?.unit}
              </span>
              <span>
                Reserved: <strong className="text-amber">{activeActionItem.quantityReserved}</strong> {activeActionItem.resource?.unit}
              </span>
            </div>
          </div>

          {actionError && (
            <div className="p-2 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
              ACTION ERROR: {actionError}
            </div>
          )}

          {actionSuccess && (
            <div className="p-2 bg-teal/10 border border-teal/40 font-mono text-xs text-teal font-medium">
              {actionSuccess}
            </div>
          )}

          <form onSubmit={handleReserveOrRelease} className="flex flex-col sm:flex-row items-end gap-3 pt-1">
            <div className="w-full sm:w-48">
              <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                Quantity to {actionType} ({activeActionItem.resource?.unit || 'units'}) *
              </label>
              <input
                type="number"
                min="1"
                max={
                  actionType === 'reserve'
                    ? activeActionItem.quantityAvailable
                    : activeActionItem.quantityReserved
                }
                required
                value={actionQty}
                onChange={(e) => setActionQty(e.target.value)}
                className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink font-mono outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isActionSubmitting || !actionQty || Number(actionQty) <= 0}
              className="bg-ink text-white font-sans text-xs font-semibold px-4 py-2 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
            >
              {isActionSubmitting
                ? `${actionType === 'reserve' ? 'Reserving' : 'Releasing'}...`
                : actionType === 'reserve'
                ? 'Confirm reservation'
                : 'Confirm stock release'}
            </button>
          </form>
        </div>
      )}

      {/* Dense Bordered Inventory Ledger matching DESIGN_SYSTEM.md §06 */}
      <div className="border border-slate-line bg-paper-raised">
        <div className="p-3 bg-paper border-b border-slate-line flex items-center justify-between font-mono text-xs text-slate">
          <div className="uppercase tracking-wider">
            Depot Inventory Ledger ({filteredInventory.length} {filteredInventory.length === 1 ? 'item' : 'items'})
          </div>
          <div className="text-[11px]">
            {user?.name && <span>Custodian: {user.name} ({user.role.toUpperCase()})</span>}
          </div>
        </div>

        {filteredInventory.length === 0 ? (
          <div className="p-12 text-center text-slate font-sans text-sm">
            {searchTerm
              ? `No inventory items match "${searchTerm}".`
              : 'No depot inventory items recorded yet. Register your first resource above.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-line">
            {filteredInventory.map((item) => {
              const badge = getStatusBadge(item.status);
              const unit = item.resource?.unit || 'units';
              const totalStock = (item.quantityAvailable || 0) + (item.quantityReserved || 0);

              return (
                <div
                  key={item._id}
                  className="p-3.5 transition-colors hover:bg-[#F9FAF9] flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  {/* Column 1: Resource Metadata */}
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      {/* Category Tag */}
                      <span className="font-semibold uppercase px-1.5 py-0.5 bg-paper border border-slate-line text-ink">
                        [{item.resource?.category || 'supplies'}]
                      </span>

                      {/* Perishability Tag */}
                      {item.resource?.isPerishable ? (
                        <span className="font-semibold uppercase text-amber">
                          [PERISHABLE]
                        </span>
                      ) : (
                        <span className="text-slate text-[10px]">
                          [NON-PERISHABLE]
                        </span>
                      )}

                      {/* Organization / Depot Tag */}
                      {item.organization?.name && (
                        <span className="text-slate text-xs">
                          · {item.organization.name}
                        </span>
                      )}
                    </div>

                    {/* Resource Name */}
                    <div className="font-sans text-sm font-semibold text-ink">
                      {item.resource?.name || 'Unnamed Resource'}
                    </div>

                    {/* Description & Location */}
                    <div className="text-xs text-slate flex flex-wrap items-center gap-3">
                      {item.resource?.description && (
                        <span>{item.resource.description}</span>
                      )}
                      {item.location?.address && (
                        <span className="font-mono text-[11px] text-slate">
                          Depot: {item.location.address}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Status Chip & Stock Counters */}
                  <div className="flex flex-wrap items-center gap-4 shrink-0">
                    {/* Status Chip matching §03 */}
                    <div className={`px-2 py-1 border-l-[3px] ${badge.border} bg-paper border border-slate-line font-mono text-[11px] font-semibold ${badge.text}`}>
                      {badge.label}
                    </div>

                    {/* Stock Counters (IBM Plex Mono) */}
                    <div className="font-mono text-xs text-right space-y-0.5 min-w-[130px]">
                      <div className="text-ink">
                        Available: <strong className="text-teal font-bold">{item.quantityAvailable}</strong> {unit}
                      </div>
                      <div className="text-slate text-[11px]">
                        Reserved: <strong className="text-amber font-semibold">{item.quantityReserved}</strong> {unit}
                      </div>
                      <div className="text-slate text-[10px]">
                        Total: {totalStock} {unit}
                      </div>
                    </div>

                    {/* Column 3: Quick Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Reserve button */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveActionItem(item);
                          setActionType('reserve');
                          setActionQty('1');
                          setActionError(null);
                          setActionSuccess(null);
                        }}
                        disabled={item.quantityAvailable <= 0}
                        className="font-mono text-[11px] px-2.5 py-1 bg-paper text-ink border border-slate-line hover:border-ink cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed uppercase"
                        title={item.quantityAvailable <= 0 ? 'No stock available to reserve' : 'Reserve quantity'}
                      >
                        Reserve
                      </button>

                      {/* Release button */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveActionItem(item);
                          setActionType('release');
                          setActionQty('1');
                          setActionError(null);
                          setActionSuccess(null);
                        }}
                        disabled={item.quantityReserved <= 0}
                        className="font-mono text-[11px] px-2.5 py-1 bg-paper text-ink border border-slate-line hover:border-ink cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed uppercase"
                        title={item.quantityReserved <= 0 ? 'No reserved stock to release' : 'Release reserved quantity'}
                      >
                        Release
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
