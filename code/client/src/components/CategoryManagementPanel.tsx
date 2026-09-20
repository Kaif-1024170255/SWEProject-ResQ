import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export interface CategoryItem {
  _id: string;
  name: string;
  label: string;
  description: string;
  priority_level: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function getPriorityBadge(priority: CategoryItem['priority_level']) {
  switch (priority) {
    case 'critical':
      return { label: 'CRITICAL', text: 'text-rust', border: 'border-l-rust', bg: 'bg-rust/10' };
    case 'high':
      return { label: 'HIGH', text: 'text-amber', border: 'border-l-amber', bg: 'bg-amber/10' };
    case 'medium':
      return { label: 'MEDIUM', text: 'text-ink', border: 'border-l-ink', bg: 'bg-ink/5' };
    case 'low':
    default:
      return { label: 'LOW', text: 'text-slate', border: 'border-l-slate', bg: 'bg-slate/10' };
  }
}

export default function CategoryManagementPanel() {
  const { token } = useAuth();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // New Category Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newPriority, setNewPriority] = useState<CategoryItem['priority_level']>('medium');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Row action loading state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch all categories (active and inactive)
  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/categories?all=true');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve emergency categories.');
      }
      setCategories(data.categories || []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Error fetching categories.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Handle Create Category (POST /api/categories)
  const handleCreateCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!newName.trim() || !newLabel.trim() || !newDescription.trim()) {
      setCreateError('Category name, label, and description are required.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newName.trim().toLowerCase().replace(/\s+/g, '_'),
          label: newLabel.trim(),
          description: newDescription.trim(),
          priority_level: newPriority,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create emergency category.');
      }

      setCreateSuccess(`Category "${data.category.label}" created successfully.`);

      // Reset form
      setNewName('');
      setNewLabel('');
      setNewDescription('');
      setNewPriority('medium');

      // Refresh list
      await fetchCategories();

      setTimeout(() => {
        setIsFormOpen(false);
        setCreateSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error creating category.');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Toggle Active/Inactive (PATCH /api/categories/:id)
  const handleToggleActive = async (category: CategoryItem) => {
    if (!token) return;
    setActionError(null);
    setActionInProgressId(category._id);

    const nextActiveState = !category.isActive;

    try {
      const res = await fetch(`/api/categories/${category._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: nextActiveState }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update category status.');
      }

      // Update state in-memory immediately
      setCategories((prev) =>
        prev.map((c) => (c._id === category._id ? { ...c, isActive: nextActiveState } : c))
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error updating category status.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Handle Adjust Priority (PATCH /api/categories/:id)
  const handlePriorityChange = async (
    category: CategoryItem,
    newLevel: CategoryItem['priority_level']
  ) => {
    if (!token) return;
    setActionError(null);
    setActionInProgressId(category._id);

    try {
      const res = await fetch(`/api/categories/${category._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priority_level: newLevel }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update priority level.');
      }

      // Update state in-memory immediately
      setCategories((prev) =>
        prev.map((c) => (c._id === category._id ? { ...c, priority_level: newLevel } : c))
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error updating category priority.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const activeCount = categories.filter((c) => c.isActive).length;
  const inactiveCount = categories.filter((c) => !c.isActive).length;

  return (
    <div className="space-y-4">
      {/* Metric Summary Cards matching Field Ops Ledger */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Registered Categories
          </div>
          <div className="font-mono text-2xl font-bold text-ink">
            {categories.length < 10 ? `0${categories.length}` : categories.length}
          </div>
        </div>

        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Active on Public /submit
          </div>
          <div className="font-mono text-2xl font-bold text-teal">
            {activeCount < 10 ? `0${activeCount}` : activeCount}
          </div>
        </div>

        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Deactivated Categories
          </div>
          <div className="font-mono text-2xl font-bold text-slate">
            {inactiveCount < 10 ? `0${inactiveCount}` : inactiveCount}
          </div>
        </div>
      </div>

      {/* Global Ledger Action Bar */}
      <div className="p-3 bg-paper-raised border border-slate-line flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-xs font-semibold text-ink uppercase tracking-wider">
          Crisis Category Registry
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchCategories}
            disabled={isLoading}
            className="font-mono text-[11px] text-slate hover:text-ink border border-slate-line bg-paper px-2.5 py-1 cursor-pointer uppercase disabled:opacity-50"
          >
            {isLoading ? 'Syncing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsFormOpen((prev) => !prev);
              setCreateError(null);
              setCreateSuccess(null);
            }}
            className="bg-ink text-white font-sans text-xs font-semibold px-3.5 py-1 rounded-[3px] hover:bg-ink-soft cursor-pointer"
          >
            {isFormOpen ? 'Close Form' : '+ New Category'}
          </button>
        </div>
      </div>

      {/* Error Banners */}
      {fetchError && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          CATEGORY ERROR: {fetchError}
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          ACTION ERROR: {actionError}
        </div>
      )}

      {/* Create New Category Form */}
      {isFormOpen && (
        <div className="border border-slate-line bg-paper-raised p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-line pb-2">
            <div className="font-mono text-xs font-bold text-ink uppercase tracking-wider">
              Create New Emergency Category
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="font-mono text-xs text-slate hover:text-ink px-1.5 py-0.5 border border-slate-line cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          {createError && (
            <div className="p-2 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
              CREATION ERROR: {createError}
            </div>
          )}

          {createSuccess && (
            <div className="p-2 bg-teal/10 border border-teal/40 font-mono text-xs text-teal font-medium">
              {createSuccess}
            </div>
          )}

          <form onSubmit={handleCreateCategory} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Identifier Name (Key) *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. fire_hazard"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink font-mono outline-none"
                />
                <div className="font-mono text-[10px] text-slate mt-0.5">
                  Stored lowercase with underscores
                </div>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Display Label *
                </label>
                <input
                  type="text"
                  required
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Fire & Hazardous Materials"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Default Priority *
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as CategoryItem['priority_level'])}
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                >
                  <option value="critical">Critical (Immediate danger to life)</option>
                  <option value="high">High (Severe property damage or acute crisis)</option>
                  <option value="medium">Medium (Standard urgent response)</option>
                  <option value="low">Low (Advisory or routine assistance)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                Category Scope & Description *
              </label>
              <input
                type="text"
                required
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Clear guidance shown to submitters explaining when to select this category"
                className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-line">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="font-mono text-xs text-slate hover:text-ink px-3 py-1.5 border border-slate-line bg-paper cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="bg-ink text-white font-sans text-xs font-semibold px-4 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create category'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dense Bordered Category List matching DESIGN_SYSTEM.md §06 */}
      <div className="border border-slate-line bg-paper-raised">
        <div className="p-3 bg-paper border-b border-slate-line flex items-center justify-between font-mono text-xs text-slate">
          <div className="uppercase tracking-wider">
            Category Registry ({categories.length} {categories.length === 1 ? 'entry' : 'entries'})
          </div>
          <div className="text-[11px]">
            Dynamic schema synchronization enabled
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="p-10 text-center text-slate font-sans text-sm">
            No emergency categories configured.
          </div>
        ) : (
          <div className="divide-y divide-slate-line">
            {categories.map((cat) => {
              const priorityBadge = getPriorityBadge(cat.priority_level);
              const isBusy = actionInProgressId === cat._id;

              return (
                <div
                  key={cat._id}
                  className={`p-3.5 transition-colors hover:bg-[#F9FAF9] flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    !cat.isActive ? 'opacity-65 bg-paper/50' : ''
                  }`}
                >
                  {/* Column 1: Category Info */}
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      {/* Name identifier */}
                      <span className="font-semibold uppercase px-1.5 py-0.5 bg-paper border border-slate-line text-ink">
                        [{cat.name}]
                      </span>

                      {/* Active Status Badge */}
                      {cat.isActive ? (
                        <span className="font-semibold uppercase text-teal">
                          [ACTIVE]
                        </span>
                      ) : (
                        <span className="font-semibold uppercase text-slate">
                          [DEACTIVATED]
                        </span>
                      )}
                    </div>

                    {/* Label & Description */}
                    <div className="font-sans text-sm font-semibold text-ink">
                      {cat.label}
                    </div>
                    <div className="text-xs text-slate">
                      {cat.description}
                    </div>
                  </div>

                  {/* Column 2: Priority Chip & Inline Adjuster */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    {/* Priority Level Chip */}
                    <div
                      className={`px-2 py-1 border-l-[3px] ${priorityBadge.border} bg-paper border border-slate-line font-mono text-[11px] font-semibold ${priorityBadge.text}`}
                    >
                      PRIORITY: {priorityBadge.label}
                    </div>

                    {/* Priority Selector */}
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="text-slate text-[11px] uppercase">Adjust:</span>
                      <select
                        value={cat.priority_level}
                        disabled={isBusy}
                        onChange={(e) =>
                          handlePriorityChange(
                            cat,
                            e.target.value as CategoryItem['priority_level']
                          )
                        }
                        className="bg-white border border-slate-line text-xs font-mono text-ink px-2 py-1 outline-none cursor-pointer focus:border-ink disabled:opacity-50"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>

                    {/* Column 3: Active/Deactivate Button */}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleActive(cat)}
                      className={`font-mono text-[11px] px-3 py-1 border uppercase cursor-pointer transition-colors disabled:opacity-50 ${
                        cat.isActive
                          ? 'bg-paper text-rust border-slate-line hover:border-rust hover:bg-rust/5'
                          : 'bg-paper text-teal border-slate-line hover:border-teal hover:bg-teal/5'
                      }`}
                    >
                      {isBusy
                        ? 'Updating...'
                        : cat.isActive
                        ? 'Deactivate'
                        : 'Activate'}
                    </button>
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
