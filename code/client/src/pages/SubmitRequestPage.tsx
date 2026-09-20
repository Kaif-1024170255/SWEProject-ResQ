import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LocationPicker from '../components/LocationPicker';

interface DynamicCategory {
  _id: string;
  name: string;
  label: string;
  description: string;
  priority_level: string;
  isActive: boolean;
}

interface SubmissionSuccessData {
  requestId: string;
  message: string;
  attachedSuppliesCount?: number;
}

interface CatalogResource {
  _id: string;
  name: string;
  category: string;
  unit: string;
}

interface SupplyLineItem {
  resourceId: string;
  quantityRequested: number;
}

export default function SubmitRequestPage() {
  const { token, user } = useAuth();

  // Dynamic categories from backend
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [category, setCategory] = useState<string>('medical');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [lat, setLat] = useState<number>(30.901);
  const [lng, setLng] = useState<number>(75.8573);
  const [address, setAddress] = useState<string>('');

  // Available catalog resources from backend
  const [catalogResources, setCatalogResources] = useState<CatalogResource[]>([]);
  // Optional supply line items requested by submitter
  const [supplyItems, setSupplyItems] = useState<SupplyLineItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SubmissionSuccessData | null>(null);

  // Decoupled AI classification suggestion state
  const [suggestion, setSuggestion] = useState<{
    suggestedCategory: string;
    urgency: string;
    rationale: string;
  } | null>(null);
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState<boolean>(false);

  // Debounced, non-blocking classification suggestion query
  useEffect(() => {
    if (!description || description.trim().length < 8) {
      setSuggestion(null);
      return;
    }

    const timer = setTimeout(() => {
      fetch('/api/classification/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: description.trim() }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.enabled && data?.suggestion) {
            setSuggestion(data.suggestion);
            setIsSuggestionDismissed(false);
          } else {
            setSuggestion(null);
          }
        })
        .catch(() => {
          // Graceful silent fallback: never break form or show error
          setSuggestion(null);
        });
    }, 600);

    return () => clearTimeout(timer);
  }, [description]);

  useEffect(() => {
    // 1. Fetch active emergency categories from GET /api/categories
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
          setCategory((prev) => {
            const exists = data.categories.some((c: DynamicCategory) => c.name === prev);
            return exists ? prev : data.categories[0].name;
          });
        }
      })
      .catch((err) => {
        console.warn('Could not load dynamic categories, falling back to defaults:', err);
      });

    // 2. Fetch available registered catalog resources for supply item picker
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        if (data.resources && Array.isArray(data.resources)) {
          setCatalogResources(data.resources);
        }
      })
      .catch((err) => {
        console.warn('Could not pre-load resource catalog for supply line items:', err);
      });
  }, []);

  const handleLocationChange = (newLat: number, newLng: number, newAddress?: string) => {
    setLat(newLat);
    setLng(newLng);
    if (newAddress !== undefined) {
      setAddress(newAddress);
    }
  };

  const handleAddSupplyItem = () => {
    if (catalogResources.length === 0) return;
    setSupplyItems((prev) => [
      ...prev,
      { resourceId: catalogResources[0]._id, quantityRequested: 1 },
    ]);
  };

  const handleRemoveSupplyItem = (index: number) => {
    setSupplyItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateSupplyItem = (
    index: number,
    field: keyof SupplyLineItem,
    val: string | number
  ) => {
    setSupplyItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!description.trim()) {
      setErrorMessage('Please describe the emergency situation or immediate needs.');
      return;
    }

    setIsSubmitting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Step 1: Create the base emergency request
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          description: description.trim(),
          preciseLat: lat,
          preciseLng: lng,
          address: address.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit emergency request.');
      }

      const newRequestId = data.requestId;

      // Step 2: If itemized supplies were specified, associate each with the created request
      const validSupplyItems = supplyItems.filter(
        (item) => item.resourceId && Number(item.quantityRequested) > 0
      );

      if (validSupplyItems.length > 0) {
        for (const item of validSupplyItems) {
          try {
            await fetch(`/api/requests/${encodeURIComponent(newRequestId)}/resources`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                resourceId: item.resourceId,
                quantityRequested: Number(item.quantityRequested),
              }),
            });
          } catch (resErr) {
            console.warn(`Could not attach supply requirement ${item.resourceId}:`, resErr);
          }
        }
      }

      setSuccessData({
        requestId: data.requestId,
        message: data.message,
        attachedSuppliesCount: validSupplyItems.length,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('A network error occurred while transmitting the emergency request.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSuccessData(null);
    setDescription('');
    setContactPhone('');
    setCategory('medical');
    setSupplyItems([]);
  };

  return (
    <div className="max-w-[800px] mx-auto px-4 sm:px-8 py-12">
      {/* Top Breadcrumb / Header */}
      <div className="flex items-center justify-between border-b border-slate-line pb-4 mb-6">
        <div>
          <div className="font-mono text-xs text-slate tracking-wide mb-1">
            resQ / EMERGENCY DISPATCH
          </div>
          <h1 className="text-3xl font-bold text-ink">
            Submit Emergency Request
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/track"
            className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
          >
            Track request
          </Link>
          {user ? (
            <Link
              to="/dashboard"
              className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="font-mono text-xs text-ink border border-slate-line px-3 py-1.5 rounded-[3px] hover:bg-paper"
            >
              Staff login
            </Link>
          )}
        </div>
      </div>

      {/* Success Confirmation State */}
      {successData ? (
        <div className="bg-paper-raised border border-slate-line p-8 space-y-6">
          <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold px-3 py-1.5 bg-paper-raised border border-slate-line border-l-[3px] border-l-teal text-teal">
            <span className="w-1.5 h-1.5 bg-teal"></span>
            REQUEST LOGGED
          </div>

          <div>
            <div className="font-mono text-xs text-slate uppercase tracking-wider mb-1">
              Tracking Identifier
            </div>
            <div className="font-mono text-3xl font-bold text-ink">
              {successData.requestId}
            </div>
          </div>

          <div className="p-4 bg-paper border border-slate-line text-sm text-ink leading-relaxed">
            <p className="mb-2 font-semibold">What happens next?</p>
            <p className="text-slate">
              Your request has been logged as{' '}
              <span className="font-mono font-semibold text-ink">{successData.requestId}</span>. A
              volunteer or NGO will be able to see it once it&apos;s verified.
            </p>
            {successData.attachedSuppliesCount && successData.attachedSuppliesCount > 0 ? (
              <p className="mt-2 text-xs font-mono text-teal font-semibold">
                ✓ {successData.attachedSuppliesCount} itemized material requirement(s) attached. Responders and depots can view and fulfill these needs.
              </p>
            ) : null}
            <p className="text-slate text-xs mt-2">
              For security and privacy, your exact coordinates are kept protected and will only be
              revealed to the verified responder who claims this request.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to={`/track?id=${encodeURIComponent(successData.requestId)}`}
              className="bg-ink text-white font-sans text-sm font-semibold px-5 py-2.5 rounded-[3px] border border-transparent hover:bg-ink-soft cursor-pointer"
            >
              Track this request
            </Link>
            <button
              type="button"
              onClick={handleResetForm}
              className="bg-transparent text-ink font-sans text-sm font-semibold px-5 py-2.5 rounded-[3px] border border-ink hover:bg-paper cursor-pointer"
            >
              Submit another request
            </button>
          </div>
        </div>
      ) : (
        /* Submission Form */
        <div className="bg-paper-raised border border-slate-line p-6 sm:p-8">
          <p className="text-slate text-sm mb-6 max-w-[65ch]">
            Report immediate life-safety, medical, rescue, food/water, or shelter requirements.
            Public bystander reports are accepted without registration.
          </p>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust">
              <div className="flex items-center gap-2 font-mono text-xs text-rust font-semibold">
                <span className="w-1.5 h-1.5 bg-rust inline-block"></span>
                SUBMISSION ERROR: {errorMessage}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
                Emergency Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
              >
                {categories.length > 0 ? (
                  categories.map((cat) => (
                    <option key={cat._id} value={cat.name}>
                      {cat.label} ({cat.description})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="medical">Medical (Injuries, critical medication, acute illness)</option>
                    <option value="rescue">Rescue (Trapped individuals, flood water evacuation)</option>
                    <option value="supplies">Supplies (Clean drinking water, baby food, emergency rations)</option>
                    <option value="shelter">Shelter (Displaced families, collapsed housing)</option>
                    <option value="other">Other Hazards (Downed power lines, blocked roads)</option>
                  </>
                )}
              </select>

              {/* Dismissible AI Category Suggestion Chip */}
              {suggestion && !isSuggestionDismissed && (
                <div className="mt-2 p-2 bg-paper border border-slate-line flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate uppercase text-[10px]">Suggested:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCategory(suggestion.suggestedCategory);
                        setIsSuggestionDismissed(true);
                      }}
                      className="text-ink font-semibold hover:underline cursor-pointer flex items-center gap-1.5 text-left"
                    >
                      <span className="capitalize">{suggestion.suggestedCategory}</span>
                      <span className="text-slate font-normal">({suggestion.urgency} urgency)</span>
                      <span className="text-rust font-normal">— tap to apply</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSuggestionDismissed(true)}
                    className="text-slate hover:text-ink text-sm px-1.5 cursor-pointer font-sans leading-none"
                    title="Dismiss suggestion"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
                Situation Description
              </label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what is needed, how many people are affected, and any immediate hazards..."
                className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none leading-relaxed resize-y"
              />
              <div className="font-mono text-[11px] text-slate mt-1">
                Be specific about immediate needs, headcounts, or medical conditions.
              </div>
            </div>

            {/* Map Location Picker */}
            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
                Incident Location (Map Pin)
              </label>
              <LocationPicker lat={lat} lng={lng} onChange={handleLocationChange} initialAddress={address} />
              <div className="font-mono text-[11px] text-slate mt-1">
                Click or drag the pin to mark the emergency location. Coordinates are fuzzed
                publicly to protect privacy until claimed.
              </div>
            </div>

            {/* Optional Contact Phone */}
            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono mb-1.5">
                Contact Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
              />
              <div className="font-mono text-[11px] text-slate mt-1">
                Responders may call to verify details or coordinate delivery.
              </div>
            </div>

            {/* Optional: What supplies do you need? (Itemized Resource Requirements) */}
            <div className="border-t border-slate-line pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider font-mono">
                    What supplies do you need? (Optional)
                  </label>
                  <p className="text-xs text-slate mt-0.5">
                    Itemize specific material supplies (water crates, trauma kits, blankets, rations) so depots can allocate to your request.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddSupplyItem}
                  disabled={catalogResources.length === 0}
                  className="font-mono text-xs px-3 py-1.5 bg-paper-raised text-ink border border-slate-line hover:border-ink cursor-pointer uppercase shrink-0 disabled:opacity-50 self-start sm:self-auto"
                >
                  + Add needed supply
                </button>
              </div>

              {supplyItems.length > 0 && (
                <div className="space-y-2 mt-3 p-3 bg-paper border border-slate-line">
                  {supplyItems.map((item, idx) => {
                    const selectedRes = catalogResources.find((r) => r._id === item.resourceId);
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row items-center gap-2">
                        <select
                          value={item.resourceId}
                          onChange={(e) => handleUpdateSupplyItem(idx, 'resourceId', e.target.value)}
                          className="w-full sm:flex-1 bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink font-sans outline-none"
                        >
                          {catalogResources.map((res) => (
                            <option key={res._id} value={res._id}>
                              {res.name} [{res.category.toUpperCase()}] ({res.unit})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <span className="font-mono text-xs text-slate uppercase">Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={item.quantityRequested}
                            onChange={(e) =>
                              handleUpdateSupplyItem(
                                idx,
                                'quantityRequested',
                                Math.max(1, Number(e.target.value))
                              )
                            }
                            className="w-20 bg-white border border-slate-line focus:border-ink px-2 py-1.5 text-xs text-ink font-mono outline-none text-center"
                          />
                          <span className="font-mono text-xs text-slate min-w-[50px]">
                            {selectedRes?.unit || 'units'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveSupplyItem(idx)}
                            className="font-mono text-xs text-rust hover:text-ink px-2 py-1 border border-slate-line bg-paper-raised cursor-pointer"
                            title="Remove this supply item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto bg-ink text-white font-sans text-sm font-semibold px-6 py-3 rounded-[3px] border border-transparent hover:bg-ink-soft disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Logging request...' : 'Submit emergency request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
