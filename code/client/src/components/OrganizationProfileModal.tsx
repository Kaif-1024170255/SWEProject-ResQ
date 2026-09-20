import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface OrganizationProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OrganizationProfileModal({
  isOpen,
  onClose,
  onSuccess,
}: OrganizationProfileModalProps) {
  const { user, token } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<'ngo' | 'government' | 'hospital' | 'supplier' | 'community_group'>('ngo');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [operatingRegion, setOperatingRegion] = useState('');
  const [address, setAddress] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false);

  useEffect(() => {
    if (!isOpen || !token || !user) return;
    const currentUserId = user.id;
    const currentUserEmail = user.email;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function loadUserOrg() {
      try {
        const res = await fetch('/api/organizations');
        if (res.ok) {
          const data = await res.json();
          const orgs = data.organizations || [];
          // Check if there is an organization where user is primaryContact
          const myOrg = orgs.find(
            (o: any) =>
              o.primaryContact &&
              (o.primaryContact._id === currentUserId || o.primaryContact === currentUserId)
          );

          if (isMounted && myOrg) {
            setIsExisting(true);
            setName(myOrg.name || '');
            setType(myOrg.type || 'ngo');
            setRegistrationNumber(myOrg.registrationNumber || '');
            setContactEmail(myOrg.contactEmail || '');
            setContactPhone(myOrg.contactPhone || '');
            setOperatingRegion(myOrg.operatingRegion || '');
            setAddress(myOrg.address || '');
          } else if (isMounted) {
            setIsExisting(false);
            // Pre-fill user's email if starting blank
            setContactEmail(currentUserEmail || '');
          }
        }
      } catch (err) {
        console.error('Failed to load user organization:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadUserOrg();

    return () => {
      isMounted = false;
    };
  }, [isOpen, token, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Organization name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        type,
        registrationNumber: registrationNumber.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        operatingRegion: operatingRegion.trim() || undefined,
        address: address.trim() || undefined,
      };

      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save organization profile');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error saving organization profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-ink/60 flex items-center justify-center p-4">
      <div className="bg-paper-raised border border-slate-line max-w-lg w-full p-5 space-y-4 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-line pb-3">
          <div>
            <div className="font-mono text-[10px] text-slate uppercase tracking-wider">
              {isExisting ? 'Organization Profile Settings' : 'Register Organization Profile'}
            </div>
            <h2 className="text-base font-semibold text-ink mt-0.5">
              {isExisting ? 'Edit Organization Details' : 'Register New Relief Entity'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-slate hover:text-ink px-2 py-0.5 border border-slate-line rounded-[3px] hover:bg-paper cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-paper border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center font-mono text-xs text-slate">
            Loading organization data...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-sans">
            {/* Name */}
            <div>
              <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                Organization / Entity Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Red Cross Ludhiana Relief Unit"
                className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-sans text-xs"
              />
            </div>

            {/* Type & Registration ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                  Entity Type *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-sans text-xs"
                >
                  <option value="ngo">NGO / Relief Organization</option>
                  <option value="government">Government / Civil Defense</option>
                  <option value="hospital">Hospital / Medical Center</option>
                  <option value="supplier">Logistics / Supply Depot</option>
                  <option value="community_group">Community / Volunteer Group</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                  Registration / DARPAN ID
                </label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="e.g. PB-NGO-2024-991"
                  className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-mono text-xs"
                />
              </div>
            </div>

            {/* Operating Region */}
            <div>
              <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                Primary Operating Region / Coverage Area
              </label>
              <input
                type="text"
                value={operatingRegion}
                onChange={(e) => setOperatingRegion(e.target.value)}
                placeholder="e.g. Ludhiana West, Sector 4, Sutlej River Basin"
                className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-sans text-xs"
              />
            </div>

            {/* Contact Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                  Dispatch / Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@org.org"
                  className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-sans text-xs"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98888 00000"
                  className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-mono text-xs"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block font-mono text-[11px] text-slate uppercase font-semibold mb-1">
                Depot / Operational Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Gate 2, Focal Point Industrial Area, Ludhiana"
                className="w-full bg-paper border border-slate-line p-2 text-ink rounded-[3px] focus:outline-none focus:border-ink font-sans text-xs"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-line">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3 py-1.5 border border-slate-line text-slate hover:text-ink font-mono text-xs rounded-[3px] hover:bg-paper cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-ink text-white hover:bg-ink-soft px-4 py-1.5 font-mono text-xs font-semibold rounded-[3px] cursor-pointer"
              >
                {isSubmitting
                  ? 'Saving...'
                  : isExisting
                  ? 'Update Organization Profile'
                  : 'Register Organization'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
