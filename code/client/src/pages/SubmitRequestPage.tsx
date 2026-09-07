import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LocationPicker from '../components/LocationPicker';

type CategoryType = 'medical' | 'shelter' | 'supplies' | 'rescue' | 'other';

interface SubmissionSuccessData {
  requestId: string;
  message: string;
}

export default function SubmitRequestPage() {
  const { token, user } = useAuth();

  const [category, setCategory] = useState<CategoryType>('medical');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  // Default coordinate center: Sector 4 / Ludhiana area matching seed coordinates
  const [lat, setLat] = useState<number>(30.901);
  const [lng, setLng] = useState<number>(75.8573);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SubmissionSuccessData | null>(null);

  const handleLocationChange = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
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

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          description: description.trim(),
          preciseLat: lat,
          preciseLng: lng,
          contactPhone: contactPhone.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit emergency request.');
      }

      setSuccessData({
        requestId: data.requestId,
        message: data.message,
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
                onChange={(e) => setCategory(e.target.value as CategoryType)}
                className="w-full bg-white border border-slate-line focus:border-ink rounded-[3px] font-sans px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="medical">Medical (Injuries, critical medication, acute illness)</option>
                <option value="rescue">Rescue (Trapped individuals, flood water evacuation)</option>
                <option value="supplies">Supplies (Clean drinking water, baby food, emergency rations)</option>
                <option value="shelter">Shelter (Displaced families, collapsed housing)</option>
                <option value="other">Other Hazards (Downed power lines, blocked roads)</option>
              </select>
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
              <LocationPicker lat={lat} lng={lng} onChange={handleLocationChange} />
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
