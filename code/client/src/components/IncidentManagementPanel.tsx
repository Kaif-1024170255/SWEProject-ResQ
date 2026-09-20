import { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import StatusChip from './StatusChip';
import { GeocodeResultItem } from './LocationPicker';

export interface IncidentLocation {
  description: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface IncidentItem {
  _id: string;
  incidentId: string;
  name: string;
  description: string;
  status: 'open' | 'contained' | 'closed';
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: IncidentLocation;
  requests?: string[];
  createdBy?: {
    _id: string;
    name: string;
    role: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GroupedRequest {
  _id: string;
  requestId: string;
  category: string;
  description: string;
  status: 'unverified' | 'verified' | 'in_progress' | 'resolved' | 'closed';
  location?: {
    publicLat: number;
    publicLng: number;
    preciseLat?: number;
    preciseLng?: number;
  };
  createdAt: string;
}

// Map pin icons
const incidentCenterIcon = L.divIcon({
  className: 'incident-center-pin',
  html: `<div style="width: 18px; height: 18px; border-radius: 50%; background: #B23A2F; border: 3px solid #FFFFFF; box-shadow: 0 0 0 2px #14213D; transform: translate(-50%, -50%);"></div>`,
  iconSize: [0, 0],
});

const requestPinIcon = L.divIcon({
  className: 'grouped-request-pin',
  html: `<div style="width: 12px; height: 12px; border-radius: 50%; background: #1F7A6C; border: 2px solid #FFFFFF; box-shadow: 0 0 0 1px #14213D; transform: translate(-50%, -50%);"></div>`,
  iconSize: [0, 0],
});

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

function getSeverityBadge(severity: IncidentItem['severity']) {
  switch (severity) {
    case 'critical':
      return { label: 'CRITICAL', text: 'text-rust', border: 'border-l-rust' };
    case 'high':
      return { label: 'HIGH', text: 'text-amber', border: 'border-l-amber' };
    case 'medium':
      return { label: 'MEDIUM', text: 'text-ink', border: 'border-l-ink' };
    case 'low':
    default:
      return { label: 'LOW', text: 'text-slate', border: 'border-l-slate' };
  }
}

export default function IncidentManagementPanel() {
  const { token } = useAuth();

  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [groupedRequests, setGroupedRequests] = useState<GroupedRequest[]>([]);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState<boolean>(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Creation Drawer State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createSeverity, setCreateSeverity] = useState<IncidentItem['severity']>('high');
  const [createLocDesc, setCreateLocDesc] = useState<string>('');
  const [createLat, setCreateLat] = useState<number>(30.901);
  const [createLng, setCreateLng] = useState<number>(75.8573);
  const [createRadiusKm, setCreateRadiusKm] = useState<number>(3.0);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Geocode address search state for incident epicenter
  const [locSearchQuery, setLocSearchQuery] = useState<string>('');
  const [locSearchResults, setLocSearchResults] = useState<GeocodeResultItem[]>([]);
  const [isSearchingLoc, setIsSearchingLoc] = useState<boolean>(false);
  const [isLocDropdownOpen, setIsLocDropdownOpen] = useState<boolean>(false);
  const locSearchRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locSearchRef.current && !locSearchRef.current.contains(event.target as Node)) {
        setIsLocDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced geocoding query to /api/geocode?q=... (600ms)
  useEffect(() => {
    const trimmed = locSearchQuery.trim();
    if (!isLocDropdownOpen || trimmed.length < 3) {
      setLocSearchResults([]);
      setIsSearchingLoc(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLoc(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setLocSearchResults(data.results || []);
        } else {
          setLocSearchResults([]);
        }
      } catch (err) {
        console.warn('Incident geocoding error:', err);
        setLocSearchResults([]);
      } finally {
        setIsSearchingLoc(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [locSearchQuery, isLocDropdownOpen]);

  const handleSelectIncidentAddress = (cand: GeocodeResultItem) => {
    setCreateLat(cand.lat);
    setCreateLng(cand.lng);
    setLocSearchQuery(cand.displayName);
    setIsLocDropdownOpen(false);
    if (!createLocDesc || createLocDesc === 'Ludhiana West Drainage Basin') {
      setCreateLocDesc(cand.displayName.split(',')[0]);
    }
  };

  // Link Requests State
  const [isLinkDrawerOpen, setIsLinkDrawerOpen] = useState<boolean>(false);
  const [candidateRequests, setCandidateRequests] = useState<GroupedRequest[]>([]);
  const [selectedRequestIdsToLink, setSelectedRequestIdsToLink] = useState<string[]>([]);
  const [isSubmittingLink, setIsSubmittingLink] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  // Fetch all incidents
  const fetchIncidents = useCallback(async () => {
    setIsLoadingIncidents(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/incidents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch incidents.');
      setIncidents(data.incidents || []);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error retrieving incidents list.');
    } finally {
      setIsLoadingIncidents(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Fetch requests grouped under selected incident
  const fetchIncidentRequests = useCallback(async (incidentId: string) => {
    setIsLoadingRequests(true);
    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/requests`);
      const data = await res.json();
      if (res.ok) {
        setGroupedRequests(data.requests || []);
      }
    } catch (err) {
      console.warn('Could not retrieve requests for incident:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (selectedIncident) {
      fetchIncidentRequests(selectedIncident.incidentId);
    } else {
      setGroupedRequests([]);
    }
  }, [selectedIncident, fetchIncidentRequests]);

  // Load candidate open requests for linking
  const loadCandidateRequests = async () => {
    setIsLinkDrawerOpen(true);
    setLinkError(null);
    setLinkSuccess(null);
    setSelectedRequestIdsToLink([]);

    try {
      const res = await fetch('/api/requests');
      const data = await res.json();
      if (res.ok && Array.isArray(data.requests)) {
        // Exclude requests already grouped under this incident
        const currentGroupedIds = new Set(groupedRequests.map((r) => r.requestId));
        const available = data.requests.filter((r: GroupedRequest) => !currentGroupedIds.has(r.requestId));
        setCandidateRequests(available);
      }
    } catch {
      setLinkError('Failed to load available emergency requests to link.');
    }
  };

  // Handle Create Incident Submission
  const handleCreateIncident = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!createName.trim() || !createDescription.trim() || !createLocDesc.trim()) {
      setCreateError('Incident name, description, and location description are required.');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim(),
          severity: createSeverity,
          location: {
            description: createLocDesc.trim(),
            lat: createLat,
            lng: createLng,
            radiusKm: Number(createRadiusKm),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create incident.');
      }

      setCreateSuccess(`Incident ${data.incident.incidentId} declared successfully.`);

      // Reset form
      setCreateName('');
      setCreateDescription('');
      setCreateLocDesc('');
      setCreateRadiusKm(3.0);

      await fetchIncidents();
      setSelectedIncident(data.incident);

      setTimeout(() => {
        setIsCreateOpen(false);
        setCreateSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error creating incident.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Handle Link Requests to Incident
  const handleLinkRequests = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !selectedIncident || selectedRequestIdsToLink.length === 0) return;

    setIsSubmittingLink(true);
    setLinkError(null);
    setLinkSuccess(null);

    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(selectedIncident.incidentId)}/requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestIds: selectedRequestIdsToLink,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link requests to incident.');
      }

      setLinkSuccess(`Successfully linked ${data.linkedCount || selectedRequestIdsToLink.length} request(s).`);

      // Refresh grouped requests and incidents list
      await fetchIncidentRequests(selectedIncident.incidentId);
      await fetchIncidents();

      setTimeout(() => {
        setIsLinkDrawerOpen(false);
        setLinkSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Error linking requests.');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const toggleRequestSelection = (requestId: string) => {
    setSelectedRequestIdsToLink((prev) =>
      prev.includes(requestId) ? prev.filter((id) => id !== requestId) : [...prev, requestId]
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Ledger Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Active Incidents
          </div>
          <div className="font-mono text-2xl font-bold text-ink">
            {incidents.length < 10 ? `0${incidents.length}` : incidents.length}
          </div>
        </div>

        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Open Clusters
          </div>
          <div className="font-mono text-2xl font-bold text-amber">
            {incidents.filter((i) => i.status === 'open').length}
          </div>
        </div>

        <div className="p-3.5 bg-paper-raised border border-slate-line">
          <div className="font-mono text-[11px] text-slate uppercase tracking-wider mb-1">
            Selected Incident Group
          </div>
          <div className="font-mono text-sm font-semibold text-ink truncate mt-1">
            {selectedIncident ? selectedIncident.name : 'None Selected'}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-3 bg-paper-raised border border-slate-line flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-xs font-semibold text-ink uppercase tracking-wider">
          Incident Command & Cluster Management
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchIncidents}
            disabled={isLoadingIncidents}
            className="font-mono text-[11px] text-slate hover:text-ink border border-slate-line bg-paper px-2.5 py-1 cursor-pointer uppercase disabled:opacity-50"
          >
            {isLoadingIncidents ? 'Syncing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsCreateOpen((prev) => !prev);
              setCreateError(null);
              setCreateSuccess(null);
            }}
            className="bg-ink text-white font-sans text-xs font-semibold px-3.5 py-1 rounded-[3px] hover:bg-ink-soft cursor-pointer"
          >
            {isCreateOpen ? 'Close Form' : '+ Declare Major Incident'}
          </button>
        </div>
      </div>

      {/* Error Banners */}
      {errorMessage && (
        <div className="p-3 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
          INCIDENT ERROR: {errorMessage}
        </div>
      )}

      {/* Declare Incident Form with Interactive Radius Map Picker */}
      {isCreateOpen && (
        <div className="border border-slate-line bg-paper-raised p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-line pb-2">
            <div className="font-mono text-xs font-bold text-ink uppercase tracking-wider">
              Declare Major Incident with Geographic Bounding Radius
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
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

          <form onSubmit={handleCreateIncident} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Incident Title / Code Name *
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Flash Flood Sector 4 Breach"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Severity Level *
                </label>
                <select
                  value={createSeverity}
                  onChange={(e) => setCreateSeverity(e.target.value as IncidentItem['severity'])}
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                >
                  <option value="critical">Critical (Mass casualty / immediate evacuation)</option>
                  <option value="high">High (Severe structural/environmental threat)</option>
                  <option value="medium">Medium (Moderate disruption / contained)</option>
                  <option value="low">Low (Advisory watch)</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                  Location Name / Sector *
                </label>
                <input
                  type="text"
                  required
                  value={createLocDesc}
                  onChange={(e) => setCreateLocDesc(e.target.value)}
                  placeholder="e.g. Ludhiana West Drainage Basin"
                  className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[11px] text-slate uppercase mb-1">
                Operational Situation Description *
              </label>
              <textarea
                required
                rows={2}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Tactical overview of the crisis event, affected population, and response strategy..."
                className="w-full bg-white border border-slate-line focus:border-ink px-2.5 py-1.5 text-xs text-ink outline-none resize-y"
              />
            </div>

            {/* Geographic Bounding Radius Specification */}
            <div className="border border-slate-line p-3 bg-paper space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs font-semibold text-ink uppercase">
                    Bounding Perimeter (Epicenter & Radius)
                  </span>
                  <div className="font-mono text-[11px] text-slate">
                    Click anywhere on the map to set the center point. Adjust radius to scale the perimeter circle.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate uppercase">Radius:</span>
                  <input
                    type="number"
                    min="0.2"
                    max="50"
                    step="0.1"
                    value={createRadiusKm}
                    onChange={(e) => setCreateRadiusKm(Math.max(0.1, Number(e.target.value)))}
                    className="w-20 bg-white border border-slate-line px-2 py-1 text-xs font-mono text-ink text-center outline-none"
                  />
                  <span className="font-mono text-xs text-slate">km</span>

                  {/* Quick Radius Presets */}
                  {[1, 3, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCreateRadiusKm(preset)}
                      className={`font-mono text-[10px] px-2 py-1 border uppercase cursor-pointer ${
                        createRadiusKm === preset
                          ? 'bg-ink text-white border-ink'
                          : 'bg-paper-raised text-slate border-slate-line hover:border-ink'
                      }`}
                    >
                      {preset}k
                    </button>
                  ))}
                </div>
              </div>

              {/* Address Search Bar for Incident Epicenter */}
              <div ref={locSearchRef} className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={locSearchQuery}
                      onChange={(e) => {
                        setLocSearchQuery(e.target.value);
                        setIsLocDropdownOpen(true);
                      }}
                      onFocus={() => {
                        if (locSearchQuery.trim().length >= 3) {
                          setIsLocDropdownOpen(true);
                        }
                      }}
                      placeholder="Search address, landmark, or sector to center perimeter (e.g. Civil Lines, Ludhiana)..."
                      className="w-full bg-white border border-slate-line focus:border-ink font-sans text-xs px-2.5 py-1.5 text-ink outline-none"
                    />
                    {isSearchingLoc && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate">
                        Searching...
                      </div>
                    )}
                  </div>
                  {locSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocSearchQuery('');
                        setLocSearchResults([]);
                        setIsLocDropdownOpen(false);
                      }}
                      className="font-mono text-[11px] text-slate hover:text-ink px-2 py-1 border border-slate-line bg-paper cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {isLocDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 z-[1200] mt-1 bg-paper-raised border border-slate-line shadow-sm max-h-48 overflow-y-auto">
                    {locSearchResults.length > 0 ? (
                      locSearchResults.map((item, idx) => (
                        <button
                          key={`${item.lat}-${item.lng}-${idx}`}
                          type="button"
                          onClick={() => handleSelectIncidentAddress(item)}
                          className="w-full text-left px-3 py-2 border-b border-slate-line/50 hover:bg-paper transition-colors font-mono text-xs flex flex-col cursor-pointer"
                        >
                          <span className="text-ink font-medium truncate">{item.displayName}</span>
                          <span className="text-[10px] text-slate">
                            {item.lat.toFixed(5)}, {item.lng.toFixed(5)} {item.type ? `· ${item.type}` : ''}
                          </span>
                        </button>
                      ))
                    ) : isSearchingLoc ? (
                      <div className="p-2 font-mono text-xs text-slate">Searching OpenStreetMap Nominatim...</div>
                    ) : locSearchQuery.trim().length >= 3 ? (
                      <div className="p-2 font-mono text-xs text-slate">No locations found. Try adjusting terms or click map directly.</div>
                    ) : (
                      <div className="p-2 font-mono text-xs text-slate">Type at least 3 characters to search...</div>
                    )}
                  </div>
                )}
              </div>

              {/* Interactive Mini Leaflet Map */}
              <div className="h-64 w-full border border-slate-line bg-paper-raised relative">
                <MapContainer
                  center={[createLat, createLng]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler onClick={(lat, lng) => { setCreateLat(lat); setCreateLng(lng); }} />
                  <MapRecenter lat={createLat} lng={createLng} />
                  <Marker position={[createLat, createLng]} icon={incidentCenterIcon} />
                  <Circle
                    center={[createLat, createLng]}
                    radius={createRadiusKm * 1000}
                    pathOptions={{
                      color: '#B23A2F',
                      fillColor: '#B23A2F',
                      fillOpacity: 0.12,
                      weight: 2,
                      dashArray: '5 5',
                    }}
                  />
                </MapContainer>

                <div className="absolute bottom-2 left-2 z-[1000] bg-paper-raised/95 border border-slate-line px-2 py-1 font-mono text-[10px] text-ink">
                  Center: {createLat.toFixed(4)}, {createLng.toFixed(4)} · Radius: {createRadiusKm} km ({Math.round(createRadiusKm * 1000)}m)
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-line">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="font-mono text-xs text-slate hover:text-ink px-3 py-1.5 border border-slate-line bg-paper cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingCreate}
                className="bg-ink text-white font-sans text-xs font-semibold px-4 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCreate ? 'Declaring...' : 'Declare major incident'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Split Interface: Incident Ledger (Left/Top) & Incident Detail / Grouped Requests (Right/Bottom) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Pane: Incidents List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="border border-slate-line bg-paper-raised">
            <div className="p-3 bg-paper border-b border-slate-line flex items-center justify-between font-mono text-xs text-slate">
              <span className="uppercase tracking-wider">
                Declared Incidents ({incidents.length})
              </span>
              <span className="text-[11px]">Select to inspect group</span>
            </div>

            {incidents.length === 0 ? (
              <div className="p-8 text-center text-slate font-sans text-sm">
                No active major incidents declared. Click "+ Declare Major Incident" above.
              </div>
            ) : (
              <div className="divide-y divide-slate-line max-h-[600px] overflow-y-auto">
                {incidents.map((incident) => {
                  const severity = getSeverityBadge(incident.severity);
                  const isSelected = selectedIncident?.incidentId === incident.incidentId;
                  const reqCount = incident.requests?.length || 0;

                  return (
                    <div
                      key={incident._id}
                      onClick={() => setSelectedIncident(incident)}
                      className={`p-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-paper border-l-[3px] border-l-ink'
                          : 'hover:bg-[#F9FAF9]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                        <span className="font-bold text-ink">{incident.incidentId}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.2 border-l-[2px] ${severity.border} font-semibold ${severity.text}`}>
                            {severity.label}
                          </span>
                          <span className="text-slate uppercase">
                            · {incident.status}
                          </span>
                        </div>
                      </div>

                      <div className="font-sans text-xs font-semibold text-ink mb-1">
                        {incident.name}
                      </div>

                      <div className="text-[11px] text-slate font-mono flex items-center justify-between">
                        <span>Loc: {incident.location.description}</span>
                        <span className="text-ink font-semibold">
                          {reqCount} {reqCount === 1 ? 'ticket' : 'tickets'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Selected Incident Workspace & Grouped Requests */}
        <div className="lg:col-span-7 space-y-4">
          {selectedIncident ? (
            <div className="border border-slate-line bg-paper-raised p-4 space-y-4">
              {/* Selected Incident Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-line pb-3">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs text-slate mb-1">
                    <span className="font-bold text-ink">{selectedIncident.incidentId}</span>
                    <span>· Declared by {selectedIncident.createdBy?.name || 'Central Dispatch'}</span>
                  </div>
                  <h2 className="text-lg font-bold text-ink">
                    {selectedIncident.name}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 font-mono text-xs font-semibold border border-slate-line border-l-[3px] ${getSeverityBadge(selectedIncident.severity).border} ${getSeverityBadge(selectedIncident.severity).text}`}>
                    {selectedIncident.severity.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={loadCandidateRequests}
                    className="bg-ink text-white font-sans text-xs font-semibold px-3 py-1.5 rounded-[3px] hover:bg-ink-soft cursor-pointer"
                  >
                    + Link Requests to Incident
                  </button>
                </div>
              </div>

              {/* Incident Details Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono p-3 bg-paper border border-slate-line">
                <div>
                  <span className="text-slate uppercase block mb-0.5">Location Zone:</span>
                  <span className="text-ink font-semibold">{selectedIncident.location.description}</span>
                </div>
                <div>
                  <span className="text-slate uppercase block mb-0.5">Bounding Perimeter:</span>
                  <span className="text-ink font-semibold">
                    {selectedIncident.location.radiusKm ? `${selectedIncident.location.radiusKm} km radius` : 'Unspecified radius'}
                    {selectedIncident.location.lat && selectedIncident.location.lng && ` (${selectedIncident.location.lat.toFixed(4)}, ${selectedIncident.location.lng.toFixed(4)})`}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate uppercase block mb-0.5">Assessment:</span>
                  <span className="text-ink font-sans">{selectedIncident.description}</span>
                </div>
              </div>

              {/* Visual Grouping Layer on Map */}
              {selectedIncident.location.lat && selectedIncident.location.lng && (
                <div className="space-y-1">
                  <div className="font-mono text-[11px] text-slate uppercase">
                    Incident Map Layer (Perimeter & Grouped Tickets)
                  </div>
                  <div className="h-48 w-full border border-slate-line relative">
                    <MapContainer
                      center={[selectedIncident.location.lat, selectedIncident.location.lng]}
                      zoom={13}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <MapRecenter
                        lat={selectedIncident.location.lat}
                        lng={selectedIncident.location.lng}
                      />
                      {/* Epicenter Marker */}
                      <Marker
                        position={[selectedIncident.location.lat, selectedIncident.location.lng]}
                        icon={incidentCenterIcon}
                      />
                      {/* Perimeter Circle */}
                      <Circle
                        center={[selectedIncident.location.lat, selectedIncident.location.lng]}
                        radius={(selectedIncident.location.radiusKm || 3) * 1000}
                        pathOptions={{
                          color: '#B23A2F',
                          fillColor: '#B23A2F',
                          fillOpacity: 0.12,
                          weight: 2,
                          dashArray: '5 5',
                        }}
                      />
                      {/* Grouped Requests Markers */}
                      {groupedRequests.map((req) => {
                        const lat = req.location?.preciseLat ?? req.location?.publicLat;
                        const lng = req.location?.preciseLng ?? req.location?.publicLng;
                        if (!lat || !lng) return null;
                        return (
                          <Marker
                            key={req._id}
                            position={[lat, lng]}
                            icon={requestPinIcon}
                          />
                        );
                      })}
                    </MapContainer>
                  </div>
                </div>
              )}

              {/* Link Requests Drawer / Modal */}
              {isLinkDrawerOpen && (
                <div className="border border-slate-line bg-paper p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-line pb-2">
                    <span className="font-mono text-xs font-bold text-ink uppercase">
                      Select Emergency Requests to Link to {selectedIncident.incidentId}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsLinkDrawerOpen(false)}
                      className="font-mono text-xs text-slate hover:text-ink px-1.5 py-0.5 border border-slate-line cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {linkError && (
                    <div className="p-2 bg-paper-raised border border-slate-line border-l-[3px] border-l-rust font-mono text-xs text-rust">
                      {linkError}
                    </div>
                  )}

                  {linkSuccess && (
                    <div className="p-2 bg-teal/10 border border-teal/40 font-mono text-xs text-teal font-medium">
                      {linkSuccess}
                    </div>
                  )}

                  {candidateRequests.length === 0 ? (
                    <div className="p-4 text-center text-slate font-sans text-xs">
                      No unlinked open emergency requests available to attach.
                    </div>
                  ) : (
                    <form onSubmit={handleLinkRequests} className="space-y-3">
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-line border border-slate-line bg-white">
                        {candidateRequests.map((req) => {
                          const isChecked = selectedRequestIdsToLink.includes(req.requestId);
                          return (
                            <label
                              key={req._id}
                              className="p-2 flex items-center justify-between gap-2 hover:bg-[#F9FAF9] cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleRequestSelection(req.requestId)}
                                  className="accent-ink"
                                />
                                <span className="font-mono text-xs font-semibold text-ink">
                                  {req.requestId}
                                </span>
                                <span className="font-mono text-[10px] text-slate uppercase">
                                  [{req.category}]
                                </span>
                                <span className="text-xs text-ink truncate max-w-xs">
                                  {req.description}
                                </span>
                              </div>
                              <StatusChip status={req.status} className="scale-90" />
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="font-mono text-xs text-slate">
                          {selectedRequestIdsToLink.length} ticket(s) selected
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsLinkDrawerOpen(false)}
                            className="font-mono text-xs text-slate px-3 py-1 border border-slate-line bg-paper cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingLink || selectedRequestIdsToLink.length === 0}
                            className="bg-ink text-white font-sans text-xs font-semibold px-4 py-1 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                          >
                            {isSubmittingLink ? 'Linking...' : 'Link Selected Requests'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Grouped Requests Ledger (GET /api/incidents/:id/requests) */}
              <div className="border border-slate-line bg-paper-raised">
                <div className="p-2.5 bg-paper border-b border-slate-line flex items-center justify-between font-mono text-xs text-slate">
                  <span className="uppercase tracking-wider">
                    Grouped Incident Requests ({groupedRequests.length})
                  </span>
                  {isLoadingRequests && <span className="text-[11px]">Loading...</span>}
                </div>

                {groupedRequests.length === 0 ? (
                  <div className="p-8 text-center text-slate font-sans text-xs">
                    No requests currently linked to this incident. Click &quot;+ Link Requests to Incident&quot; above to cluster reports.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-line max-h-64 overflow-y-auto">
                    {groupedRequests.map((req) => (
                      <div
                        key={req._id}
                        className="p-2.5 transition-colors hover:bg-[#F9FAF9] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="font-semibold text-ink">{req.requestId}</span>
                            <span className="text-slate uppercase text-[10px]">
                              [{req.category}]
                            </span>
                          </div>
                          <div className="text-xs text-ink leading-tight">
                            {req.description}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <StatusChip status={req.status} className="scale-90" />
                          <span className="font-mono text-[10px] text-slate">
                            {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-slate-line bg-paper-raised p-12 text-center text-slate font-sans text-sm">
              Select an incident from the left ledger to inspect grouped emergency tickets and view its bounding perimeter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
