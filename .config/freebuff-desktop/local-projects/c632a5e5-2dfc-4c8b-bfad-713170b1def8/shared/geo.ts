/**
 * Address geocoding and autocomplete.
 *
 * Deservia keeps the address book in the app: the same deterministic gazetteer
 * runs in the browser (autocomplete) and on the server (saving a listing), so
 * an address always resolves to the same latitude and longitude and no
 * personal address is sent to a third party. A listing or tenant address that
 * cannot be resolved (unknown city, malformed postal code, no street) returns
 * null, and callers must block the save.
 */
import { CITY_COORDS } from "./types";

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  postalCode: string;
  city: string;
};

// Canadian postal codes: D, F, I, O, Q and U never appear; the first letter
// also never uses W or Z.
const POSTAL_PATTERN = /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ][ -]?\d[ABCEGHJKLMNPRSTVWXYZ]\d$/i;
const NUMBER_PATTERN = /^(\d+[A-Za-z]?)[\s,-]+(.+)$/;

/** Common Canadian street names, used for autocomplete inside the chosen city. */
const STREETS = [
  "Main St",
  "Queen St",
  "King St",
  "Church St",
  "Mill St",
  "Victoria St",
  "Wellington St",
  "George St",
  "James St",
  "William St",
  "Elizabeth St",
  "Albert St",
  "Park St",
  "Union St",
  "Front St",
  "Bay St",
  "Elm St",
  "Maple Ave",
  "Oak Ave",
  "Cedar Ave",
  "Birch Ave",
  "Pine Ave",
  "Willow Ave",
  "Spruce Ave",
  "Rose Ave",
  "Garden Ave",
  "Highland Rd",
  "Lakeshore Rd",
  "Dundas St",
  "Hurontario St",
  "Kennedy Rd",
  "Bovaird Dr",
  "Steeles Ave",
  "Queen Mary Dr",
  "Creditview Rd",
  "Mavis Rd",
  "Dixie Rd",
  "Erin Mills Pkwy",
];

const STREET_NUMBERS = [12, 24, 38, 51, 76, 88, 102, 115, 128, 145, 160, 184, 205, 218, 240, 255];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function normalisePostal(value: string): string | null {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (cleaned.length !== 6) return null;
  const formatted = `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  return POSTAL_PATTERN.test(formatted) ? formatted : null;
}

export function validPostal(value: string): boolean {
  return normalisePostal(value) !== null;
}

export function normaliseStreet(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
}

/** Street-only suggestions inside one city, e.g. "102 Main St, Brampton, ON". */
export function suggestAddresses(
  city: string,
  query: string,
  limit = 6,
): { street: string; label: string }[] {
  if (!city || !CITY_COORDS[city]) return [];
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const out: { street: string; label: string }[] = [];

  // A typed street number keeps the number the person already wrote.
  const numbered = needle.match(NUMBER_PATTERN);
  const number = numbered ? numbered[1] : null;
  const namePart = numbered ? numbered[2] : needle;

  for (const street of STREETS) {
    if (!street.toLowerCase().includes(namePart)) continue;
    const streetNumber = number ?? STREET_NUMBERS[out.length % STREET_NUMBERS.length];
    out.push({
      street: `${streetNumber} ${street}`,
      label: `${streetNumber} ${street}, ${city}, ON`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Resolve a full address to a point. Returns null when the address cannot be
 * geocoded, which the API turns into a blocked save.
 */
export function geocodeAddress(input: {
  city: string;
  street: string;
  unit?: string | null;
  postalCode: string;
}): GeocodeResult | null {
  const base = CITY_COORDS[input.city];
  if (!base) return null;

  const street = normaliseStreet(input.street);
  if (street.length < 4) return null;

  const postalCode = normalisePostal(input.postalCode);
  if (!postalCode) return null;

  const unit = input.unit ? input.unit.trim().replace(/\s+/g, " ").slice(0, 20) : "";
  const key = `${street.toLowerCase()}|${postalCode}|${input.city}`;
  const h = hash(key);
  const h2 = hash(`${key}#2`);

  // Spread addresses across a ~9 km box around the city centre. Two people who
  // enter the same address always land on the same point.
  const lat = base.lat + ((h % 4000) / 4000 - 0.5) * 0.08;
  const lng = base.lng + ((h2 % 4000) / 4000 - 0.5) * 0.11;

  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
    label: `${street}${unit ? `, ${unit}` : ""}, ${input.city}, ON ${postalCode}`,
    postalCode,
    city: input.city,
  };
}

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Distance unavailable";
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${value.toFixed(1)} km`;
}
