import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

interface LocationPickerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
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

// Component to programmatically re-center map when coordinates change via geolocation or input
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

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

  const markerEventHandlers = useMemo(
    () => ({
      dragend(e: any) {
        const marker = e.target;
        if (marker) {
          const newLatLng = marker.getLatLng();
          onChange(Number(newLatLng.lat.toFixed(6)), Number(newLatLng.lng.toFixed(6)));
        }
      },
    }),
    [onChange]
  );

  return (
    <div className="border border-slate-line bg-paper-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="font-mono text-xs text-slate uppercase">
          Pin Location · Click or drag to adjust
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

      {/* Leaflet Map Surface */}
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
          <MapClickHandler onChange={onChange} />
          <MapRecenter lat={lat} lng={lng} />
          <Marker
            position={[lat, lng]}
            draggable={true}
            eventHandlers={markerEventHandlers}
            icon={pinIcon}
          />
        </MapContainer>
      </div>

      {/* Coordinate Readout & Status */}
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
