import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export interface GeocodeResultItem {
  displayName: string;
  lat: number;
  lng: number;
  type?: string;
}

interface LocationPickerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number, address?: string) => void;
  initialAddress?: string;
}

// Custom map pin matching DESIGN_SYSTEM.md §07 console layout
const pinIcon = L.divIcon({
  className: 'resq-map-pin',
  html: `<div style="width: 16px; height: 16px; border-radius: 50%; background: #B23A2F; border: 2px solid #FFFFFF; box-shadow: 0 0 0 1px rgba(20, 33, 61, 0.4); transform: translate(-50%, -50%);"></div>`,
  iconSize: [0, 0],
});

// Component to handle clicks on the map to reposition pin
function MapClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

// Component to programmatically re-center map when coordinates change via geocoding, geolocation, or input
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({
  lat,
  lng,
  onChange,
  initialAddress = '',
}: LocationPickerProps) {
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Address search state
  const [searchQuery, setSearchQuery] = useState(initialAddress);
  const [searchResults, setSearchResults] = useState<GeocodeResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced geocoding query to /api/geocode?q=... (600ms)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!isDropdownOpen || trimmed.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          throw new Error('Geocoding search failed');
        }
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err) {
        console.warn('[LocationPicker] Geocoding lookup error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [searchQuery, isDropdownOpen]);

  // Attempt browser geolocation on initial mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      setGeoStatus('Locating device...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = Number(position.coords.latitude.toFixed(6));
          const userLng = Number(position.coords.longitude.toFixed(6));
          onChange(userLat, userLng);
          setGeoStatus('Location acquired via device GPS');
        },
        (_error) => {
          setGeoStatus('Device location unavailable (using default dispatch center)');
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    } else {
      setGeoStatus('Geolocation not supported by this browser');
    }
  }, []);

  const handleManualGeolocate = () => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('Geolocation not supported by this browser');
      return;
    }

    setIsLocating(true);
    setGeoStatus('Requesting GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = Number(position.coords.latitude.toFixed(6));
        const userLng = Number(position.coords.longitude.toFixed(6));
        onChange(userLat, userLng);
        setGeoStatus('Location updated via device GPS');
        setIsLocating(false);
      },
      (error) => {
        setGeoStatus(`Could not acquire location: ${error.message}`);
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectResult = (result: GeocodeResultItem) => {
    setSearchQuery(result.displayName);
    setIsDropdownOpen(false);
    setGeoStatus(`Selected: ${result.displayName.slice(0, 48)}...`);
    onChange(result.lat, result.lng, result.displayName);
  };

  const handleMapClick = (newLat: number, newLng: number) => {
    onChange(newLat, newLng);
    setGeoStatus('Pin positioned manually on map');
  };

  const markerEventHandlers = useMemo(
    () => ({
      dragend(e: any) {
        const marker = e.target;
        if (marker) {
          const newLatLng = marker.getLatLng();
          const newLat = Number(newLatLng.lat.toFixed(6));
          const newLng = Number(newLatLng.lng.toFixed(6));
          onChange(newLat, newLng);
          setGeoStatus('Pin dragged manually on map');
        }
      },
    }),
    [onChange]
  );

  return (
    <div className="border border-slate-line bg-paper-raised p-3">
      {/* 1. Address Search Bar (Text Geocoding) */}
      <div ref={searchContainerRef} className="relative mb-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="font-mono text-xs text-slate uppercase">
            Search Address or Landmark
          </label>
          {isSearching && (
            <span className="font-mono text-[11px] text-slate animate-pulse">
              Searching OSM...
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => {
              if (searchQuery.trim().length >= 3) {
                setIsDropdownOpen(true);
              }
            }}
            placeholder="Type address, sector, or landmark (e.g. Civil Lines, Ludhiana)..."
            className="w-full bg-white border border-slate-line focus:border-ink px-3 py-1.5 text-xs text-ink font-sans outline-none rounded-[2px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsDropdownOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate hover:text-ink text-xs font-mono px-1 cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dropdown Suggestions (Matching DESIGN_SYSTEM.md dense rows) */}
        {isDropdownOpen && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-[1000] mt-1 bg-paper-raised border border-slate-line shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-line">
            {searchResults.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectResult(item)}
                className="w-full text-left p-2.5 hover:bg-paper cursor-pointer transition-colors block text-xs"
              >
                <div className="text-ink font-sans leading-snug line-clamp-2">
                  {item.displayName}
                </div>
                <div className="font-mono text-[10px] text-slate mt-0.5 flex items-center justify-between">
                  <span className="uppercase text-[9px] bg-paper px-1 border border-slate-line">
                    {item.type || 'LOCATION'}
                  </span>
                  <span>
                    {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {isDropdownOpen &&
          !isSearching &&
          searchQuery.trim().length >= 3 &&
          searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 z-[1000] mt-1 bg-paper-raised border border-slate-line shadow-md p-3 text-center text-xs font-mono text-slate">
              No matching locations found for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
      </div>

      {/* 2. Map Pin & Geolocation Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pt-2 border-t border-slate-line">
        <div className="font-mono text-xs text-slate uppercase">
          Or Pin Location Directly · Click or drag map pin
        </div>
        <button
          type="button"
          onClick={handleManualGeolocate}
          disabled={isLocating}
          className="font-mono text-xs text-ink hover:underline border border-slate-line px-2 py-1 rounded-[3px] bg-white cursor-pointer"
        >
          {isLocating ? 'Acquiring GPS...' : 'Use current location'}
        </button>
      </div>

      {/* 3. Leaflet Map Surface */}
      <div className="h-[280px] w-full border border-slate-line relative z-0">
        <MapContainer
          center={[lat, lng]}
          zoom={14}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onChange={handleMapClick} />
          <MapRecenter lat={lat} lng={lng} />
          <Marker
            position={[lat, lng]}
            draggable={true}
            eventHandlers={markerEventHandlers}
            icon={pinIcon}
          />
        </MapContainer>
      </div>

      {/* 4. Coordinate Readout & Status Bar */}
      <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-slate font-mono">
        <div>
          COORDINATES:{' '}
          <span className="text-ink font-semibold">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
        </div>
        {geoStatus && <div className="text-[11px] text-slate">{geoStatus}</div>}
      </div>
    </div>
  );
}
