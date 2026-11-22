import type { Home, Listing, Lifestyle, Profile, Trust } from "../shared/types";

/**
 * Schema is created on first request so a fresh D1 database works without a
 * manual migration step. Existing databases get the added columns in place.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    consent_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    avatar TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#a4123f,#ff5c97',
    lifestyle TEXT NOT NULL,
    home TEXT,
    expectations TEXT NOT NULL DEFAULT '',
    excluded TEXT NOT NULL DEFAULT '[]',
    demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    landlord_id TEXT NOT NULL,
    title TEXT NOT NULL,
    blurb TEXT NOT NULL DEFAULT '',
    rent INTEGER NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🏡',
    accent TEXT NOT NULL DEFAULT '#a4123f,#ff5c97',
    area TEXT NOT NULL,
    space_type TEXT NOT NULL,
    bedrooms INTEGER NOT NULL,
    washrooms REAL NOT NULL,
    parking TEXT NOT NULL,
    furnished TEXT NOT NULL,
    lease TEXT NOT NULL,
    available TEXT NOT NULL,
    pets_policy TEXT NOT NULL,
    smoking_policy TEXT NOT NULL,
    amenities TEXT NOT NULL DEFAULT '[]',
    paused INTEGER NOT NULL DEFAULT 0,
    leased INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    landlord_id TEXT NOT NULL,
    tenant_action TEXT NOT NULL DEFAULT 'pending',
    landlord_action TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'pending',
    viewing_at TEXT,
    screening TEXT NOT NULL DEFAULT 'not_requested',
    screening_note TEXT,
    accepted_at TEXT,
    score_snapshot TEXT,
    score_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, landlord_id)
  )`,
  `CREATE TABLE IF NOT EXISTS leases (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    reference TEXT NOT NULL,
    terms TEXT NOT NULL,
    tenant_signed_at TEXT,
    landlord_signed_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (match_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    match_id TEXT,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    role TEXT NOT NULL,
    stars INTEGER NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_audit (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS data_requests (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS viewing_slots (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (match_id, profile_id, start_utc)
  )`,
  `CREATE TABLE IF NOT EXISTS viewings (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    status TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    confirmed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    role TEXT NOT NULL,
    title TEXT,
    body TEXT,
    attachment TEXT,
    listing_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS listing_likes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    landlord_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (tenant_id, listing_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listing_likes_tenant ON listing_likes (tenant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_viewing_slots_match ON viewing_slots (match_id)`,
  `CREATE INDEX IF NOT EXISTS idx_viewings_match ON viewings (match_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_profile ON chat_messages (profile_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_profile ON notifications (profile_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_tenant ON matches (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_landlord ON matches (landlord_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ratings_to ON ratings (to_id)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_landlord ON listings (landlord_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit (admin_id)`,
];

const PROFILE_COLUMNS: Record<string, string> = {
  password_hash: "TEXT",
  consent_at: "TEXT",
  status: "TEXT NOT NULL DEFAULT 'active'",
};

const LISTING_COLUMNS: Record<string, string> = {
  paused: "INTEGER NOT NULL DEFAULT 0",
  leased: "INTEGER NOT NULL DEFAULT 0",
  available_from: "TEXT",
  deposit: "INTEGER",
  size_sqft: "INTEGER",
  floor_level: "TEXT",
  heating_cooling: "TEXT",
  laundry: "TEXT",
  utilities: "TEXT NOT NULL DEFAULT '[]'",
  entrance: "TEXT",
  kitchen: "TEXT",
  outdoor: "TEXT",
  photos: "TEXT NOT NULL DEFAULT '[]'",
  parking_detail: "TEXT",
  pets_detail: "TEXT",
  smoking_detail: "TEXT",
  washrooms_detail: "TEXT",
  address: "TEXT",
  unit: "TEXT",
  postal_code: "TEXT",
  lat: "REAL",
  lng: "REAL",
};

const MATCH_COLUMNS: Record<string, string> = {
  score_snapshot: "TEXT",
  score_at: "TEXT",
  application_sent_at: "TEXT",
  listing_id: "TEXT",
};

export type ProfileRow = {
  id: string;
  role: string;
  name: string;
  tagline: string;
  email: string;
  password_hash: string | null;
  consent_at: string | null;
  status: string;
  avatar: string;
  accent: string;
  lifestyle: string;
  home: string | null;
  expectations: string;
  excluded: string;
  demo: number;
};

export type ListingRow = {
  id: string;
  landlord_id: string;
  title: string;
  blurb: string;
  rent: number;
  emoji: string;
  accent: string;
  area: string;
  space_type: string;
  bedrooms: number;
  washrooms: number;
  parking: string;
  furnished: string;
  lease: string;
  available: string;
  pets_policy: string;
  smoking_policy: string;
  amenities: string;
  paused: number;
  leased: number;
  available_from: string | null;
  deposit: number | null;
  size_sqft: number | null;
  floor_level: string | null;
  heating_cooling: string | null;
  laundry: string | null;
  utilities: string;
  entrance: string | null;
  kitchen: string | null;
  outdoor: string | null;
  photos: string;
  parking_detail: string | null;
  pets_detail: string | null;
  smoking_detail: string | null;
  washrooms_detail: string | null;
  address: string | null;
  unit: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
};

export type MatchDbRow = {
  id: string;
  tenant_id: string;
  landlord_id: string;
  tenant_action: string;
  landlord_action: string;
  status: string;
  viewing_at: string | null;
  screening: string;
  screening_note: string | null;
  accepted_at: string | null;
  score_snapshot: string | null;
  score_at: string | null;
  application_sent_at: string | null;
  listing_id: string | null;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_LIFESTYLE: Lifestyle = {
  schedule: "out_day",
  chronotype: "between",
  social: "mix",
  tidiness: "reasonable",
  music: "quiet",
  hobbies: [],
  pets: "no_preference",
  smoking: "non",
  kitchenUse: "daily",
  smells: "light",
  issueSpeed: "24h",
  work: "employed",
  diet: "no_restrictions",
  travel: "homebody",
  drives: "non_driver",
};

export const DEFAULT_HOME: Home = {
  spaceType: "apartment",
  area: "Brampton",
  budget: 1500,
  timing: "within_month",
  bedrooms: 1,
  washrooms: 1,
  parking: "nice",
  furnished: "unfurnished",
  lease: "1yr",
  issueSpeed: "24h",
  concern: "repairs",
  radiusKm: null,
  center: null,
  unitTypes: [],
  priceMin: 500,
  priceMax: 5000,
  priceNoPref: true,
};


export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role as Profile["role"],
    name: row.name,
    tagline: row.tagline,
    email: row.email,
    avatar: row.avatar,
    accent: row.accent,
    lifestyle: JSON.parse(row.lifestyle) as Lifestyle,
    home: row.home ? (JSON.parse(row.home) as Home) : null,
    expectations: row.expectations,
    excluded: safeArray(row.excluded),
    demo: row.demo === 1,
    consentAt: row.consent_at,
  };
}

export function mapListing(row: ListingRow): Listing {
  return {
    id: row.id,
    landlordId: row.landlord_id,
    title: row.title,
    blurb: row.blurb,
    rent: row.rent,
    emoji: row.emoji,
    accent: row.accent,
    area: row.area,
    spaceType: row.space_type,
    bedrooms: row.bedrooms,
    washrooms: row.washrooms,
    parking: row.parking,
    furnished: row.furnished,
    lease: row.lease,
    available: row.available,
    petsPolicy: row.pets_policy,
    smokingPolicy: row.smoking_policy,
    amenities: safeArray(row.amenities),
    paused: row.paused === 1,
    leased: row.leased === 1,
    availableFrom: row.available_from,
    deposit: row.deposit,
    sizeSqft: row.size_sqft,
    floorLevel: row.floor_level,
    heatingCooling: row.heating_cooling,
    laundry: row.laundry,
    utilities: safeArray(row.utilities),
    entrance: row.entrance,
    kitchen: row.kitchen,
    outdoor: row.outdoor,
    photos: safeArray(row.photos),
    parkingDetail: row.parking_detail,
    petsDetail: row.pets_detail,
    smokingDetail: row.smoking_detail,
    washroomsDetail: row.washrooms_detail,
    address: row.address,
    unit: row.unit,
    postalCode: row.postal_code,
    lat: row.lat,
    lng: row.lng,
  };
}

function safeArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function getProfile(db: D1Database, id: string): Promise<Profile | null> {
  const row = await db.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<ProfileRow>();
  return row ? mapProfile(row) : null;
}

export async function getProfileRow(db: D1Database, id: string): Promise<ProfileRow | null> {
  return db.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<ProfileRow>();
}

export async function getListing(db: D1Database, id: string): Promise<Listing | null> {
  const row = await db.prepare("SELECT * FROM listings WHERE id = ?").bind(id).first<ListingRow>();
  return row ? mapListing(row) : null;
}

export async function getListingForLandlord(
  db: D1Database,
  landlordId: string,
): Promise<Listing | null> {
  const row = await db
    .prepare("SELECT * FROM listings WHERE landlord_id = ? ORDER BY rowid LIMIT 1")
    .bind(landlordId)
    .first<ListingRow>();
  return row ? mapListing(row) : null;
}

export async function listListingsForLandlord(
  db: D1Database,
  landlordId: string,
): Promise<Listing[]> {
  const { results } = await db
    .prepare("SELECT * FROM listings WHERE landlord_id = ? ORDER BY rowid")
    .bind(landlordId)
    .all<ListingRow>();
  return (results ?? []).map(mapListing);
}

export async function listTenants(db: D1Database): Promise<Profile[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM profiles WHERE role = 'tenant' AND status = 'active' ORDER BY name",
    )
    .all<ProfileRow>();
  return (results ?? []).map(mapProfile);
}

export async function listLandlords(db: D1Database): Promise<{ profile: Profile; listing: Listing }[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*, l.id AS listing_id FROM profiles p
       JOIN listings l ON l.landlord_id = p.id
       WHERE p.role = 'landlord' AND p.status = 'active'
         AND l.paused = 0 AND l.leased = 0
       ORDER BY p.name`,
    )
    .all<ProfileRow & { listing_id: string }>();
  const out: { profile: Profile; listing: Listing }[] = [];
  for (const row of results ?? []) {
    const listing = await getListing(db, row.listing_id);
    if (listing) out.push({ profile: mapProfile(row), listing });
  }
  return out;
}

export async function getTrust(db: D1Database, profileId: string): Promise<Trust> {
  const { results } = await db
    .prepare(
      "SELECT stars, tags, note, role, created_at FROM ratings WHERE to_id = ? ORDER BY created_at DESC",
    )
    .bind(profileId)
    .all<{ stars: number; tags: string; note: string | null; role: string; created_at: string }>();

  const rows = results ?? [];
  const count = rows.length;
  const average = count
    ? Math.round((rows.reduce((sum, r) => sum + r.stars, 0) / count) * 10) / 10
    : null;
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of safeArray(row.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return {
    count,
    average,
    badge: count >= 5 && (average ?? 0) >= 4.5,
    tags: [...tagCounts.entries()]
      .map(([tag, c]) => ({ tag, count: c }))
      .sort((a, b) => b.count - a.count),
    reviews: rows.slice(0, 8).map((row) => ({
      stars: row.stars,
      tags: safeArray(row.tags),
      note: row.note,
      fromRole: row.role,
      createdAt: row.created_at,
    })),
  };
}

let ready: Promise<void> | null = null;

/**
 * Create the tables and add any missing columns. Nothing is inserted here:
 * every account, profile and listing is created through the interface.
 */
export function ensureReady(db: D1Database): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
      await ensureColumns(db, "profiles", PROFILE_COLUMNS);
      await ensureColumns(db, "listings", LISTING_COLUMNS);
      await ensureColumns(db, "matches", MATCH_COLUMNS);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function ensureColumns(
  db: D1Database,
  table: string,
  columns: Record<string, string>,
): Promise<void> {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const present = new Set((results ?? []).map((row) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!present.has(name)) {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
    }
  }
}

