import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: { Autocomplete: new (el: HTMLInputElement, opts?: { fields?: string[] }) => GAutocomplete };
        event?: { clearInstanceListeners: (obj: unknown) => void };
      };
    };
  }
}

type GAutocomplete = {
  addListener: (ev: string, fn: () => void) => void;
  getPlace: () => {
    formatted_address?: string;
    place_id?: string;
    geometry?: { location?: { lat: () => number; lng: () => number } };
    address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  };
};

export type GoogleAddressSelection = {
  formattedAddress: string;
  placeId: string;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
};

type Props = {
  value: string;
  onChangeAddress: (address: string) => void;
  onResolved: (sel: GoogleAddressSelection) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

const GOOGLE_SCRIPT_ID = "google-maps-places-script";

function loadGooglePlaces(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.places) return Promise.resolve();
  const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "1") {
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(t);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(t);
        reject(new Error("Google Maps failed to load"));
      }, 15000);
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = GOOGLE_SCRIPT_ID;
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error("Could not load Google Maps script"));
    document.head.appendChild(s);
  });
}

/** Address line using Google Places when `VITE_GOOGLE_MAPS_API_KEY` is set; otherwise a normal input. */
export function GoogleAddressInput({ value, onChangeAddress, onResolved, disabled, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<GAutocomplete | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey?.trim() || !inputRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        await loadGooglePlaces(apiKey.trim());
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "address_components", "place_id"],
        });
        acRef.current = ac;
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const formatted = place.formatted_address ?? inputRef.current?.value ?? "";
          let pin: string | null = null;
          for (const c of place.address_components ?? []) {
            if (c.types.includes("postal_code")) {
              pin = c.long_name || c.short_name || null;
              break;
            }
          }
          const loc = place.geometry?.location;
          const lat = loc ? loc.lat() : null;
          const lng = loc ? loc.lng() : null;
          onChangeAddress(formatted);
          onResolved({
            formattedAddress: formatted,
            placeId: place.place_id ?? "",
            pincode: pin,
            lat,
            lng,
          });
        });
      } catch {
        /* fall back to plain input */
      }
    })();
    return () => {
      cancelled = true;
      try {
        if (acRef.current && window.google?.maps?.event?.clearInstanceListeners) {
          window.google.maps.event.clearInstanceListeners(acRef.current);
        }
      } catch {
        /* ignore */
      }
      acRef.current = null;
    };
  }, [apiKey, onChangeAddress, onResolved]);

  if (!apiKey?.trim()) {
    return (
      <Input
        value={value}
        onChange={(e) => onChangeAddress(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? "Street, area, city"}
        className={className}
      />
    );
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => onChangeAddress(e.target.value)}
      disabled={disabled}
      placeholder={placeholder ?? "Start typing address (Google)"}
      className={className}
      autoComplete="off"
    />
  );
}
