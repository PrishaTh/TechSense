/**
 * Tenant-side selection helpers.
 *
 * These run before scoring and never feed the scorer: they decide which
 * listings are eligible (radius, unit size, price) and how far each one is.
 * Ranking lives beside the scorer, in `worker/index.ts`, because it needs the
 * computed match score.
 */
import type { GeoPoint, FilterSummary, Home, Listing } from "../shared/types";
import { CITY_COORDS, distanceKm } from "../shared/types";

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * The listing's saved latitude/longitude. Listings saved before exact
 * addresses existed fall back to a stable point near their city centre.
 */
export function listingPoint(listing: Listing): { lat: number; lng: number } {
  if (typeof listing.lat === "number" && typeof listing.lng === "number") {
    return { lat: listing.lat, lng: listing.lng };
  }
  const base = CITY_COORDS[listing.area] ?? CITY_COORDS.Brampton;
  const h = hash(listing.id);
  return {
    lat: base.lat + ((h % 2000) / 2000 - 0.5) * 0.09,
    lng: base.lng + ((Math.floor(h / 2000) % 2000) / 2000 - 0.5) * 0.13,
  };
}

/** The tenant's address takes priority over a live browser location. */
export function tenantOrigin(
  home: Home,
  override: { lat: number; lng: number } | null,
): { point: GeoPoint | null; radiusKm: number | null } {
  const point = override ? { ...override, label: "Your current location" } : home.center ?? null;
  const radiusKm = point ? home.radiusKm ?? 5 : null;
  return { point, radiusKm };
}

export function distanceToListing(
  listing: Listing,
  point: { lat: number; lng: number } | null,
): number | null {
  if (!point) return null;
  return distanceKm(point, listingPoint(listing));
}

/** Unit-size and price filters. City is replaced by the radius when one is set. */
export function passesTenantFilters(listing: Listing, home: Home): boolean {
  const unitTypes = Array.isArray(home.unitTypes) ? home.unitTypes : [];
  if (unitTypes.length) {
    const sizeOk = unitTypes.some((value) =>
      value >= 4 ? listing.bedrooms >= 4 : listing.bedrooms === value,
    );
    if (!sizeOk) return false;
  }
  if (home.priceNoPref === false) {
    const min = home.priceMin ?? 0;
    const max = home.priceMax ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(listing.rent)) return false;
    if (listing.rent < min || listing.rent > max) return false;
  }
  return true;
}

export function buildFilterSummary(input: {
  home: Home;
  radiusKm: number | null;
  centerLabel: string | null;
  survived: number;
  fallbackCount: number;
  poolSize: number;
  shortPool: boolean;
}): FilterSummary {
  const priceOn = input.home.priceNoPref === false;
  return {
    area: input.home.area,
    radiusKm: input.radiusKm,
    centerLabel: input.centerLabel,
    unitTypes: Array.isArray(input.home.unitTypes) ? input.home.unitTypes : [],
    priceMin: priceOn ? input.home.priceMin ?? 0 : 0,
    priceMax: priceOn ? input.home.priceMax ?? 0 : 0,
    priceNoPref: !priceOn,
    survived: input.survived,
    fallbackCount: input.fallbackCount,
    poolSize: input.poolSize,
    shortPool: input.shortPool,
  };
}
