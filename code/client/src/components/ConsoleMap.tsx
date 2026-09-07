import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import StatusChip from './StatusChip';
import { DispatchRequest } from './DispatchLog';

interface ConsoleMapProps {
  requests: DispatchRequest[];
  selectedRequestId: string | null;
  onSelectRequest: (id: string | null) => void;
  onAction: (id: string, action: 'verify' | 'claim' | 'resolve') => void;
  actionInProgressId: string | null;
}

// Status Pin Color Tokens matching DESIGN_SYSTEM.md §02 & design-reference.html §07
const PIN_COLORS: Record<string, string> = {
  unverified: '#D98E2B', // Signal Amber
  verified: '#1F7A6C',   // Response Teal
  in_progress: '#B23A2F',// Alert Rust
  resolved: '#1F7A6C',   // Response Teal
  default: '#5B6670',    // Slate
};

function getPinIcon(status: string, isSelected: boolean) {
  const color = PIN_COLORS[status] || PIN_COLORS.default;
  const shadow = isSelected
    ? 'box-shadow: 0 0 0 3px #14213D, 0 2px 10px rgba(0,0,0,0.35); transform: translate(-50%, -50%) scale(1.35);'
    : 'box-shadow: 0 0 0 1px rgba(20, 33, 61, 0.35); transform: translate(-50%, -50%);';

  return L.divIcon({
    className: 'resq-map-pin',
    html: `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 2px solid #FFFFFF; ${shadow} transition: transform 0.15s ease, box-shadow 0.15s ease;"></div>`,
    iconSize: [0, 0],
    popupAnchor: [0, -10],
  });
}

// Programmatically pans/zooms the map when a request is selected from the rail or map
function MapController({
  selectedRequest,
  allRequests,
}: {
  selectedRequest: DispatchRequest | null;
  allRequests: DispatchRequest[];
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  // Auto-fit bounds on initial load if requests exist
  useEffect(() => {
    if (!initialFitDone.current && allRequests.length > 0) {
      const validCoords = allRequests
        .map((r) => {
          const lat = r.location.preciseLat ?? r.location.publicLat;
          const lng = r.location.preciseLng ?? r.location.publicLng;
          return [lat, lng] as [number, number];
        })
        .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

      if (validCoords.length > 0) {
        const bounds = L.latLngBounds(validCoords);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        initialFitDone.current = true;
      }
    }
  }, [allRequests, map]);

  // Pan to selected request when chosen from rail
  useEffect(() => {
    if (selectedRequest) {
      const lat = selectedRequest.location.preciseLat ?? selectedRequest.location.publicLat;
      const lng = selectedRequest.location.preciseLng ?? selectedRequest.location.publicLng;
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 13), {
          duration: 0.7,
        });
      }
    }
  }, [selectedRequest, map]);

  return null;
}

export default function ConsoleMap({
  requests,
  selectedRequestId,
  onSelectRequest,
  onAction,
  actionInProgressId,
}: ConsoleMapProps) {
  const { user } = useAuth();

  // Find the currently selected request
  const selectedRequest = useMemo(() => {
    return requests.find((r) => r.requestId === selectedRequestId) || null;
  }, [requests, selectedRequestId]);

  const isAdmin = user?.role === 'admin';
  const isResponder =
    user?.role === 'volunteer' ||
    user?.role === 'ngo' ||
    user?.role === 'resource_provider';

  // Default coordinate center: Ludhiana operations sector matching seed data
  const defaultCenter: [number, number] = [30.901, 75.8573];

  return (
    <div className="relative w-full h-full min-h-[380px] sm:min-h-[460px] md:min-h-full border border-slate-line bg-[#E4E8E4] overflow-hidden">
      {/* Map Header Overlay Legend */}
      <div className="absolute top-3 right-3 z-[1000] bg-paper-raised/95 backdrop-blur-sm border border-slate-line px-3 py-2 text-[11px] font-mono flex items-center gap-3 pointer-events-auto">
        <span className="text-slate uppercase tracking-wider font-semibold">Map Pins:</span>
        <span className="flex items-center gap-1.5 text-amber font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber border border-white"></span>
          Unverified
        </span>
        <span className="flex items-center gap-1.5 text-teal font-semibold">
          <span className="w-2 h-2 rounded-full bg-teal border border-white"></span>
          Verified
        </span>
        <span className="flex items-center gap-1.5 text-rust font-semibold">
          <span className="w-2 h-2 rounded-full bg-rust border border-white"></span>
          In Progress
        </span>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
        style={{ width: '100%', height: '100%', minHeight: '380px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController selectedRequest={selectedRequest} allRequests={requests} />

        {requests.map((req) => {
          const lat = req.location.preciseLat ?? req.location.publicLat;
          const lng = req.location.preciseLng ?? req.location.publicLng;

          if (isNaN(lat) || isNaN(lng)) return null;

          const isSelected = req.requestId === selectedRequestId;
          const icon = getPinIcon(req.status, isSelected);
          const isClaimant = user && req.claimedBy && req.claimedBy._id === user.id;
          const isBusy = actionInProgressId === req.requestId;

          return (
            <Marker
              key={req._id}
              position={[lat, lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectRequest(req.requestId),
              }}
            >
              <Popup
                eventHandlers={{
                  remove: () => {
                    if (selectedRequestId === req.requestId) {
                      onSelectRequest(null);
                    }
                  },
                }}
              >
                <div className="p-3 w-[260px] sm:w-[280px] font-sans space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-line pb-1.5">
                    <span className="font-mono text-xs font-bold text-ink">
                      {req.requestId}
                    </span>
                    <span className="font-mono text-[10px] text-slate uppercase">
                      {req.category}
                    </span>
                  </div>

                  <div>
                    <StatusChip status={req.status} className="text-[10px] py-0.5 px-2" />
                  </div>

                  <p className="text-xs text-ink line-clamp-3 leading-relaxed">
                    {req.description}
                  </p>

                  {/* Revealing coordinates & phone for authorized users */}
                  {req.location.preciseLat !== undefined ? (
                    <div className="p-1.5 bg-paper border border-slate-line font-mono text-[10px] space-y-0.5">
                      <div className="text-rust font-semibold">
                        GPS: {req.location.preciseLat.toFixed(6)}, {req.location.preciseLng?.toFixed(6)}
                      </div>
                      {req.contactPhone && (
                        <div className="text-ink">Phone: {req.contactPhone}</div>
                      )}
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] text-slate">
                      Location fuzzed (~300m) for privacy
                    </div>
                  )}

                  {/* Contextual Action Button */}
                  <div className="pt-1.5 border-t border-slate-line flex items-center justify-between">
                    {req.status === 'unverified' && isAdmin && (
                      <button
                        type="button"
                        onClick={() => onAction(req.requestId, 'verify')}
                        disabled={isBusy}
                        className="w-full bg-ink text-white font-sans text-xs font-semibold py-1.5 px-3 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? 'Verifying...' : 'Verify'}
                      </button>
                    )}

                    {req.status === 'verified' && isResponder && (
                      <button
                        type="button"
                        onClick={() => onAction(req.requestId, 'claim')}
                        disabled={isBusy}
                        className="w-full bg-ink text-white font-sans text-xs font-semibold py-1.5 px-3 rounded-[3px] hover:bg-ink-soft cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? 'Claiming...' : 'Claim this request'}
                      </button>
                    )}

                    {req.status === 'in_progress' && (isClaimant || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => onAction(req.requestId, 'resolve')}
                        disabled={isBusy}
                        className="w-full bg-transparent text-ink font-sans text-xs font-semibold py-1.5 px-3 rounded-[3px] border border-ink hover:bg-paper cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? 'Resolving...' : 'Mark resolved'}
                      </button>
                    )}

                    {req.status === 'resolved' && (
                      <div className="text-[11px] font-mono text-slate italic">
                        Awaiting requester confirm
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
