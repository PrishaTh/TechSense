/**
 * Shared domain model for Deservia.
 *
 * Everything the matching engine is allowed to read lives in `Lifestyle`,
 * `Home` and `Listing`. Identity fields (name, avatar, email) are never passed
 * to the scorer, and protected grounds have no representation at all — there is
 * nowhere in this schema for them to enter a score.
 */

export type Role = "tenant" | "landlord" | "admin";

export type Action = "pending" | "like" | "pass";
/**
 * `requested` is a tenant's like waiting on the landlord. `mutual` means the
 * landlord accepted it. `accepted` is the later lease stage.
 */
export type MatchStatus =
  | "pending"
  | "requested"
  | "mutual"
  | "declined"
  | "withdrawn"
  | "accepted";
export type ScreeningStatus =
  | "not_requested"
  | "passed"
  | "flagged";

export type Lifestyle = {
  schedule: string;
  chronotype: string;
  social: string;
  tidiness: string;
  music: string;
  hobbies: string[];
  pets: string;
  smoking: string;
  kitchenUse: string;
  smells: string;
  /** How fast this side resolves issues. Tenants keep theirs in `home`. */
  issueSpeed?: string;
  /** Questionnaire answers stored for the profile, not read by the scorer. */
  work?: string;
  diet?: string;
  travel?: string;
  drives?: string;
};

/** A point used by the optional radius filter. */
export type GeoPoint = {
  lat: number;
  lng: number;
  label: string;
  city?: string;
};

export type Home = {
  spaceType: string;
  area: string;
  budget: number;
  timing: string;
  bedrooms: number;
  washrooms: number;
  parking: string;
  furnished: string;
  lease: string;
  issueSpeed: string;
  concern: string;
  /* Filters below never reach the scorer. They decide which listings are shown. */
  radiusKm?: number | null;
  center?: GeoPoint | null;
  /** The tenant's own address, geocoded to `center` with the same gazetteer. */
  address?: string | null;
  unit?: string | null;
  postalCode?: string | null;
  /** Bedroom counts; empty means any size. 4 means 4+. */
  unitTypes?: number[];
  priceMin?: number;
  priceMax?: number;
  priceNoPref?: boolean;
};

export type Profile = {
  id: string;
  role: Role;
  name: string;
  tagline: string;
  email: string;
  avatar: string;
  accent: string;
  lifestyle: Lifestyle;
  home: Home | null;
  expectations: string;
  /** Preferences that touch a protected ground. Stored, never scored. */
  excluded: string[];
  demo: boolean;
  /** When the account accepted the 18+ and privacy confirmations. */
  consentAt?: string | null;
};

export type Listing = {
  id: string;
  landlordId: string;
  title: string;
  blurb: string;
  rent: number;
  emoji: string;
  accent: string;
  area: string;
  spaceType: string;
  bedrooms: number;
  washrooms: number;
  parking: string;
  furnished: string;
  lease: string;
  available: string;
  petsPolicy: string;
  smokingPolicy: string;
  amenities: string[];
  paused?: boolean;
  leased?: boolean;
  /* Exact address, geocoded on save. */
  address?: string | null;
  unit?: string | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  /* Fields from the listing form. Optional so listings saved earlier still load. */
  availableFrom?: string | null;
  deposit?: number | null;
  sizeSqft?: number | null;
  floorLevel?: string | null;
  heatingCooling?: string | null;
  laundry?: string | null;
  utilities?: string[];
  entrance?: string | null;
  kitchen?: string | null;
  outdoor?: string | null;
  photos?: string[];
  parkingDetail?: string | null;
  petsDetail?: string | null;
  smokingDetail?: string | null;
  washroomsDetail?: string | null;
};

export type Criterion = {
  key: string;
  label: string;
  weight: number;
  score: number;
  /** Human-readable detail for the "why this score" panel. */
  note: string;
};

export type ScoreResult = {
  score: number;
  criteria: Criterion[];
  commonalities: string[];
  watchouts: string[];
};

export type MatchRow = {
  id: string;
  tenantId: string;
  landlordId: string;
  tenantAction: Action;
  landlordAction: Action;
  status: MatchStatus;
  viewingAt: string | null;
  screening: ScreeningStatus;
  screeningNote: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type LeaseTerms = {
  landlordName: string;
  tenantName: string;
  unitTitle: string;
  area: string;
  rent: number;
  term: string;
  startDate: string;
  deposit: number;
  included: string[];
  pets: string;
  smoking: string;
  landlordSignature: string | null;
  tenantSignature: string | null;
};

export type Lease = {
  id: string;
  matchId: string;
  reference: string;
  createdAt: string;
  terms: LeaseTerms;
};

export type MatchView = {
  id: string;
  other: Profile;
  listing: Listing | null;
  score: ScoreResult;
  status: MatchStatus;
  myAction: Action;
  theirAction: Action;
  viewingAt: string | null;
  screening: ScreeningStatus;
  screeningNote: string | null;
  acceptedAt: string | null;
  lease: Lease | null;
  myRating: { stars: number; tags: string[]; note: string | null } | null;
  iAmTenant: boolean;
  createdAt: string;
  /** Only present once the match is mutual. Gated again on the server. */
  application: {
    url: string;
    downloadUrl: string;
    sentAt: string;
    fileName: string;
    checksum: string;
    /** False when the supplied PDF has not been added to the workspace yet. */
    ready: boolean;
  } | null;
};

export type ViewingStatus =
  | "proposed"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed";

export type Viewing = {
  id: string;
  matchId: string;
  startUtc: string;
  status: ViewingStatus;
  proposedBy: string;
  confirmedAt: string | null;
  createdAt: string;
};

export type ViewingState = {
  viewing: Viewing | null;
  /** ISO instants, always UTC on the wire. */
  mine: string[];
  theirs: string[];
  /** Slots the landlord has opened and nobody has booked yet. */
  overlap: string[];
  busyForLandlord: string[];
  /** Every open landlord slot, booked or not, so the calendar can highlight dates. */
  availability: string[];
  iAmTenant: boolean;
  myId: string;
  otherName: string;
  listingTitle: string;
  listingArea: string;
  listingAddress: string;
};

export type AppNotification = {
  id: string;
  kind: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Fresh listing data handed to the assistant when a tenant attaches a card. */
export type ChatListing = {
  id: string;
  title: string;
  area: string;
  address: string | null;
  distanceKm?: number | null;
  rent: number;
  deposit: number | null;
  availableFrom: string | null;
  available: string;
  lease: string;
  spaceType: string;
  bedrooms: number;
  washrooms: number;
  washroomsDetail: string | null;
  sizeSqft: number | null;
  furnished: string;
  floorLevel: string | null;
  heatingCooling: string | null;
  entrance: string | null;
  kitchen: string | null;
  outdoor: string | null;
  petsPolicy: string;
  petsDetail: string | null;
  smokingPolicy: string;
  smokingDetail: string | null;
  parking: string;
  parkingDetail: string | null;
  laundry: string | null;
  utilities: string[];
  amenities: string[];
  description: string;
  photos: string[];
  houseRules: string[];
  landlordName: string;
  match: { score: number; criteria: Criterion[]; commonalities: string[] } | null;
};

export type Recommendation = {
  other: Profile;
  listing: Listing | null;
  score: ScoreResult;
  match: {
    id: string;
    myAction: Action;
    theirAction: Action;
    status: MatchStatus;
  } | null;
  /** Position in the tenant's ten-listing deck, highest score first. */
  rank?: number;
  /** Straight-line distance from the tenant's address to this listing. */
  distanceKm?: number | null;
  /** True for the fill listings chosen from outside the tenant's radius. */
  outsideRadius?: boolean;
  /** Older label kept for saved decks; same meaning as outsideRadius. */
  fallback?: boolean;
};

export type FilterSummary = {
  area: string;
  radiusKm: number | null;
  centerLabel: string | null;
  unitTypes: number[];
  priceMin: number;
  priceMax: number;
  priceNoPref: boolean;
  /** Listings inside the radius (and the filters) before the ten-listing cut. */
  survived: number;
  /** Fill listings taken from outside the radius. */
  fallbackCount: number;
  poolSize: number;
  /** True when the whole database has fewer than ten active listings. */
  shortPool?: boolean;
};

/** Strength tags are per direction, and never describe a person. */
export const RATING_TAGS = {
  tenant: [
    "Communication",
    "Paid on time",
    "Cared for the home",
    "Honest profile",
    "Easy to deal with",
  ],
  landlord: [
    "Communication",
    "Fair pricing",
    "Quick repairs",
    "Accurate listing",
    "Respected privacy & notice",
  ],
};

export type TrustReview = {
  stars: number;
  tags: string[];
  note: string | null;
  fromRole: string;
  createdAt: string;
};

export type Trust = {
  count: number;
  average: number | null;
  badge: boolean;
  tags: { tag: string; count: number }[];
  reviews: TrustReview[];
};

export type AccountRole = "tenant" | "landlord" | "admin";

export type ReportRow = {
  id: string;
  reporterName: string;
  subjectName: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
};

export type Session = {
  profile: Profile;
  listing: Listing | null;
  listings?: Listing[];
  trust: Trust;
  stats: { mutual: number; liked: number; requests: number };
};

export type Opt = { value: string; label: string };

export const AREAS = [
  "Downtown Toronto",
  "North York",
  "Scarborough",
  "Etobicoke",
  "Mississauga",
  "Brampton",
  "Caledon",
  "Markham",
  "Vaughan",
  "Hamilton",
  "Guelph",
  "London",
  "Niagara Region",
  "Grey County",
  "Montréal",
  "Québec City",
  "Gatineau",
  "Moncton",
  "Saint John",
  "Fredericton",
  "Halifax",
  "Charlottetown",
  "St. John's",
  "Winnipeg",
  "Saskatoon",
  "Regina",
  "Edmonton",
  "Calgary",
  "Vancouver",
];

/** City centres, used for the optional radius filter and location preview. */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Downtown Toronto": { lat: 43.6532, lng: -79.3832 },
  "North York": { lat: 43.7615, lng: -79.4111 },
  Scarborough: { lat: 43.7764, lng: -79.2318 },
  Etobicoke: { lat: 43.6205, lng: -79.5132 },
  Mississauga: { lat: 43.589, lng: -79.6441 },
  Brampton: { lat: 43.7315, lng: -79.7624 },
  Caledon: { lat: 43.865, lng: -79.87 },
  Markham: { lat: 43.8561, lng: -79.337 },
  Vaughan: { lat: 43.8361, lng: -79.4983 },
  Hamilton: { lat: 43.2557, lng: -79.8711 },
  Guelph: { lat: 43.5448, lng: -80.2482 },
  London: { lat: 42.9849, lng: -81.2453 },
  "Niagara Region": { lat: 43.0896, lng: -79.0849 },
  "Grey County": { lat: 44.5686, lng: -80.9415 },
  Montréal: { lat: 45.5019, lng: -73.5674 },
  "Québec City": { lat: 46.8139, lng: -71.208 },
  Gatineau: { lat: 45.4765, lng: -75.7013 },
  Moncton: { lat: 46.0878, lng: -64.7782 },
  "Saint John": { lat: 45.2733, lng: -66.0633 },
  Fredericton: { lat: 45.9636, lng: -66.6431 },
  Halifax: { lat: 44.6488, lng: -63.5752 },
  Charlottetown: { lat: 46.2382, lng: -63.1311 },
  "St. John's": { lat: 47.5615, lng: -52.7126 },
  Winnipeg: { lat: 49.8951, lng: -97.1384 },
  Saskatoon: { lat: 52.1332, lng: -106.67 },
  Regina: { lat: 50.4452, lng: -104.6189 },
  Edmonton: { lat: 53.5461, lng: -113.4938 },
  Calgary: { lat: 51.0447, lng: -114.0719 },
  Vancouver: { lat: 49.2827, lng: -123.1207 },
};

/** Small built-in gazetteer for address autocomplete, so no address leaves the app. */
export const ADDRESS_SUGGESTIONS: { label: string; city: string; lat: number; lng: number }[] = [
  ...Object.entries(CITY_COORDS).map(([city, point]) => ({
    label: `${city}, ON`,
    city,
    lat: point.lat,
    lng: point.lng,
  })),
  { label: "Bramalea, Brampton", city: "Brampton", lat: 43.7315, lng: -79.7624 },
  { label: "Heart Lake, Brampton", city: "Brampton", lat: 43.745, lng: -79.79 },
  { label: "Mount Pleasant, Brampton", city: "Brampton", lat: 43.68, lng: -79.76 },
  { label: "Springdale, Brampton", city: "Brampton", lat: 43.75, lng: -79.73 },
  { label: "Downtown Brampton", city: "Brampton", lat: 43.685, lng: -79.76 },
  { label: "City Centre, Mississauga", city: "Mississauga", lat: 43.589, lng: -79.6441 },
  { label: "Port Credit, Mississauga", city: "Mississauga", lat: 43.555, lng: -79.585 },
  { label: "Streetsville, Mississauga", city: "Mississauga", lat: 43.58, lng: -79.71 },
  { label: "Malton, Mississauga", city: "Mississauga", lat: 43.705, lng: -79.65 },
  { label: "North York Centre", city: "North York", lat: 43.767, lng: -79.413 },
  { label: "Willowdale, North York", city: "North York", lat: 43.77, lng: -79.41 },
  { label: "Scarborough Town Centre", city: "Scarborough", lat: 43.776, lng: -79.257 },
  { label: "Agincourt, Scarborough", city: "Scarborough", lat: 43.786, lng: -79.284 },
  { label: "Etobicoke Centre", city: "Etobicoke", lat: 43.643, lng: -79.565 },
  { label: "Mimico, Etobicoke", city: "Etobicoke", lat: 43.615, lng: -79.495 },
  { label: "Liberty Village, Toronto", city: "Downtown Toronto", lat: 43.637, lng: -79.42 },
  { label: "Vaughan Metropolitan Centre", city: "Vaughan", lat: 43.794, lng: -79.528 },
  { label: "Woodbridge, Vaughan", city: "Vaughan", lat: 43.79, lng: -79.59 },
  { label: "Unionville, Markham", city: "Markham", lat: 43.865, lng: -79.31 },
  { label: "Downtown Hamilton", city: "Hamilton", lat: 43.2557, lng: -79.8711 },
];

export const UNIT_TYPE_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 0, label: "Studio", hint: "0 bedrooms" },
  { value: 1, label: "1 BHK", hint: "1 bedroom" },
  { value: 2, label: "2 BHK", hint: "2 bedrooms" },
  { value: 3, label: "3 BHK", hint: "3 bedrooms" },
  { value: 4, label: "4+ BHK", hint: "4 or more bedrooms" },
];

export const PRICE_FLOOR = 500;
export const PRICE_CEILING = 5000;
export const PRICE_STEP = 50;

export function unitTypeLabel(value: number): string {
  const option = UNIT_TYPE_OPTIONS.find((entry) => entry.value === value);
  return option ? option.label : `${value} BHK`;
}

export const HOBBY_OPTIONS: Opt[] = [
  { value: "gardening", label: "Gardening" },
  { value: "fishing", label: "Fishing" },
  { value: "painting", label: "Painting" },
  { value: "creative", label: "Artistic / creative" },
  { value: "tech", label: "Building websites / tech" },
  { value: "music", label: "Music" },
  { value: "travel", label: "Travel" },
  { value: "cooking", label: "Cooking" },
  { value: "fitness", label: "Fitness" },
  { value: "reading", label: "Reading" },
];

/** Labels for hobby ids stored before the questionnaire was rebuilt. */
const LEGACY_HOBBIES: Record<string, string> = {
  gym: "Gym",
  yoga: "Yoga",
  plants: "Plants",
  gaming: "Gaming",
  art: "Art",
  movies: "Movies",
  dancing: "Dancing",
  sports: "Sports",
};

export function hobbyLabel(value: string): string {
  return HOBBY_OPTIONS.find((option) => option.value === value)?.label ?? LEGACY_HOBBIES[value] ?? value;
}

export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function nearestCity(point: { lat: number; lng: number }): string {
  let best = "Brampton";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [city, centre] of Object.entries(CITY_COORDS)) {
    const distance = distanceKm(point, centre);
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

/** Ordered question groups. The UI renders these; the engine reads the keys. */
export const OPTIONS: Record<string, Opt[]> = {
  schedule: [
    { value: "out_day", label: "Out during the day" },
    { value: "home_day", label: "Home during the day" },
    { value: "shifts", label: "Mix / shifts vary" },
    { value: "unspecified", label: "Prefer not to say" },
  ],
  chronotype: [
    { value: "early", label: "Early riser" },
    { value: "night", label: "Night owl" },
    { value: "between", label: "Flexible" },
  ],
  social: [
    { value: "introvert", label: "Introvert" },
    { value: "extrovert", label: "Extrovert" },
    { value: "mix", label: "A bit of both" },
  ],
  tidiness: [
    { value: "very", label: "Very tidy" },
    { value: "reasonable", label: "Reasonably tidy" },
    { value: "relaxed", label: "Relaxed about it" },
  ],
  music: [
    { value: "loves", label: "Love music / a bit of noise" },
    { value: "quiet", label: "Prefer a quiet home" },
    { value: "some_noise", label: "Some noise is fine" },
  ],
  pets: [
    { value: "loves_pets", label: "Love pets" },
    { value: "have_pet", label: "I have a pet" },
    { value: "no_pets", label: "Prefer no pets" },
    { value: "dog", label: "Have a dog" },
    { value: "cat", label: "Have a cat" },
    { value: "other", label: "Other pet" },
    { value: "none", label: "No pets" },
    { value: "loves_none", label: "Love pets, none right now" },
    { value: "no_preference", label: "No preference" },
  ],
  work: [
    { value: "student", label: "Student" },
    { value: "employed", label: "Employed" },
    { value: "self_employed", label: "Self-employed" },
  ],
  diet: [
    { value: "vegan", label: "Vegan" },
    { value: "vegetarian", label: "Vegetarian" },
    { value: "pescatarian", label: "Pescatarian" },
    { value: "fruitarian", label: "Fruitarian" },
    { value: "no_restrictions", label: "No restrictions" },
  ],
  travel: [
    { value: "loves_travel", label: "Love to travel" },
    { value: "homebody", label: "Homebody" },
  ],
  drives: [
    { value: "drives", label: "I drive / have a car" },
    { value: "non_driver", label: "Non-driver" },
  ],
  smoking: [
    { value: "non", label: "Non-smoker" },
    { value: "outside", label: "Outside only" },
    { value: "smoker", label: "Smoker" },
    { value: "no_preference", label: "No preference" },
  ],
  kitchenUse: [
    { value: "daily", label: "Cook daily" },
    { value: "few", label: "A few times a week" },
    { value: "rarely", label: "Rarely cook" },
  ],
  smells: [
    { value: "strong", label: "Strong smells are fine" },
    { value: "light", label: "Light smells only" },
    { value: "rarely_cook", label: "I rarely cook" },
  ],
  issueSpeed: [
    { value: "same_day", label: "Same day" },
    { value: "24h", label: "Within 24 hours" },
    { value: "week", label: "Within a week" },
    { value: "no_pref", label: "No preference" },
  ],
  workDays: [
    { value: "home_day", label: "Work from home" },
    { value: "out_day", label: "Out of the home" },
    { value: "mix", label: "A mix of both" },
  ],
  spaceType: [
    { value: "room", label: "Room" },
    { value: "apartment", label: "Apartment" },
    { value: "basement", label: "Basement apartment" },
    { value: "house", label: "Whole house" },
    { value: "upper", label: "Upper floor" },
    { value: "rent_to_own", label: "Rent-to-own" },
  ],
  timing: [
    { value: "within_month", label: "Within a month" },
    { value: "1_3_months", label: "1–3 months" },
    { value: "flexible", label: "Flexible" },
  ],
  parking: [
    { value: "required", label: "Required" },
    { value: "nice", label: "Nice to have" },
    { value: "none", label: "Not needed" },
  ],
  furnished: [
    { value: "furnished", label: "Furnished" },
    { value: "partly", label: "Partly furnished" },
    { value: "unfurnished", label: "Unfurnished" },
    { value: "either", label: "Either is fine" },
  ],
  lease: [
    { value: "month", label: "Month-to-month" },
    { value: "6mo", label: "6 months" },
    { value: "1yr", label: "1 year" },
    { value: "2yr", label: "2+ years" },
    { value: "flexible", label: "Flexible" },
  ],
  concern: [
    { value: "privacy", label: "Privacy" },
    { value: "repairs", label: "Repairs ignored" },
    { value: "fees", label: "Hidden fees" },
    { value: "noise", label: "Noisy neighbours" },
    { value: "scams", label: "Scams" },
    { value: "rules", label: "Unclear rules" },
  ],
};

const labelCache = new Map<string, Map<string, string>>();
for (const [group, opts] of Object.entries(OPTIONS)) {
  const map = new Map<string, string>();
  for (const opt of opts) map.set(opt.value, opt.label);
  labelCache.set(group, map);
}

export function label(group: string, value: string): string {
  return labelCache.get(group)?.get(value) ?? value;
}

export function budgetLabel(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function bedroomLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio" : `${bedrooms} bed`;
}

export function washroomLabel(washrooms: number): string {
  return `${washrooms} bath`;
}

export function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
