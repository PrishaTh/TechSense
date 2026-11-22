import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  Action,
  AppNotification,
  ChatListing,
  Home,
  Lease,
  Lifestyle,
  Listing,
  MatchView,
  Profile,
  Recommendation,
  ReportRow,
  ScoreResult,
  ScreeningStatus,
  Viewing,
  ViewingState,
} from "../shared/types";
import { AREAS, HOBBY_OPTIONS, RATING_TAGS, distanceKm, label } from "../shared/types";
import {
  DEFAULT_HOME,
  DEFAULT_LIFESTYLE,
  ensureReady,
  getListing,
  getListingForLandlord,
  getProfile,
  getProfileRow,
  getTrust,
  listLandlords,
  listListingsForLandlord,
  listTenants,
  mapProfile,
  type MatchDbRow,
  type ProfileRow,
} from "./db";
import {
  FAIRNESS_NOTES,
  SCORE_VERSION,
  WEIGHTS,
  scoreTenantLandlord,
} from "./engine";
import {
  hashPassword,
  newSessionToken,
  normaliseEmail,
  tokenDigest,
  validEmail,
  verifyPassword,
} from "./auth";
import {
  buildFilterSummary,
  distanceToListing,
  passesTenantFilters,
  tenantOrigin,
} from "./filters";
import {
  APPLICATION_FILE_NAME,
  APPLICATION_SHA256,
  applicationPdfBytes,
} from "./applicationFile";
import { geocodeAddress, validPostal } from "../shared/geo";
import { chatbot } from "./chatbot";

type Env = { DB: D1Database; ASSETS: Fetcher };
type AppEnv = { Bindings: Env; Variables: { me: Profile | null } };
type AppContext = Context<AppEnv>;

const SESSION_COOKIE = "deservia_session";
const SESSION_DAYS = 7;
const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  await ensureReady(c.env.DB);
  const token = getCookie(c, SESSION_COOKIE);
  let me: Profile | null = null;
  if (token) {
    const digest = await tokenDigest(token);
    const row = await c.env.DB.prepare(
      `SELECT p.* FROM sessions s
       JOIN profiles p ON p.id = s.profile_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND p.status = 'active'`,
    )
      .bind(digest, new Date().toISOString())
      .first<ProfileRow>();
    if (row) me = mapProfile(row);
  }
  c.set("me", me);
  await next();
});

function unauthorised() {
  return Response.json({ error: "Sign in to continue." }, { status: 401 });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const LIFESTYLE_VALUES: Record<string, string[]> = {
  schedule: ["out_day", "home_day", "shifts", "unspecified", "mix"],
  chronotype: ["early", "night", "between"],
  social: ["introvert", "mix", "extrovert"],
  tidiness: ["very", "reasonable", "relaxed"],
  music: ["quiet", "some_noise", "loves"],
  pets: [
    "loves_pets",
    "have_pet",
    "no_pets",
    "dog",
    "cat",
    "other",
    "none",
    "loves_none",
    "no_preference",
  ],
  smoking: ["non", "outside", "smoker", "no_preference"],
  kitchenUse: ["daily", "few", "rarely"],
  smells: ["strong", "light", "rarely_cook"],
  issueSpeed: ["same_day", "24h", "week", "no_pref"],
  work: ["student", "employed", "self_employed"],
  diet: ["vegan", "vegetarian", "pescatarian", "fruitarian", "no_restrictions"],
  travel: ["loves_travel", "homebody"],
  drives: ["drives", "non_driver"],
};

const HOME_VALUES: Record<string, string[]> = {
  spaceType: ["room", "apartment", "basement", "house", "upper", "rent_to_own"],
  timing: ["within_month", "1_3_months", "flexible"],
  parking: ["required", "nice", "none", "included", "street"],
  furnished: ["furnished", "partly", "unfurnished", "either"],
  lease: ["month", "6mo", "1yr", "2yr", "flexible"],
  issueSpeed: ["same_day", "24h", "week", "no_pref"],
  concern: ["privacy", "repairs", "fees", "noise", "scams", "rules"],
};

/**
 * Whitelist sanitising. Only known lifestyle and home fields are ever stored.
 * Anything else a client sends (age, family status, disability, ...) is dropped
 * before it reaches the database, so it can never reach the scorer.
 */
function pickLifestyle(input: unknown, current: Lifestyle): Lifestyle {
  const source = record(input);
  const next: Lifestyle = { ...current };
  for (const [key, allowed] of Object.entries(LIFESTYLE_VALUES)) {
    const value = source[key];
    if (typeof value === "string" && allowed.includes(value)) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  if (Array.isArray(source.hobbies)) {
    const allowed = new Set([
      ...HOBBY_OPTIONS.map((option) => option.value),
      "gym",
      "yoga",
      "plants",
      "gaming",
      "art",
      "movies",
      "dancing",
      "sports",
    ]);
    next.hobbies = source.hobbies.filter(
      (hobby): hobby is string => typeof hobby === "string" && allowed.has(hobby),
    );
  }
  return next;
}

function pickHome(input: unknown, current: Home): Home {
  const source = record(input);
  const next: Home = { ...current };
  for (const [key, allowed] of Object.entries(HOME_VALUES)) {
    const value = source[key];
    if (typeof value === "string" && allowed.includes(value)) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  if (typeof source.area === "string" && AREAS.includes(source.area)) {
    next.area = source.area;
  }
  if (typeof source.budget === "number" && Number.isFinite(source.budget)) {
    next.budget = Math.max(0, Math.min(20000, Math.round(source.budget)));
  }
  if (typeof source.bedrooms === "number" && source.bedrooms >= 0 && source.bedrooms <= 4) {
    next.bedrooms = Math.round(source.bedrooms);
  }
  if (typeof source.washrooms === "number" && [1, 1.5, 2, 2.5, 3].includes(source.washrooms)) {
    next.washrooms = source.washrooms;
  }

  // The tenant's own address, used for the radius and the distance score.
  for (const key of ["address", "unit", "postalCode"] as const) {
    const value = source[key];
    if (value === null) next[key] = null;
    else if (typeof value === "string" && value.trim()) next[key] = value.trim().slice(0, 160);
  }

  // Optional listing filters. They are stored beside the profile and never
  // handed to the scoring engine.
  if (Array.isArray(source.unitTypes)) {
    const sizes = source.unitTypes.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4,
    );
    next.unitTypes = [...new Set(sizes)].sort((a, b) => a - b);
  }
  if (typeof source.priceNoPref === "boolean") next.priceNoPref = source.priceNoPref;
  for (const key of ["priceMin", "priceMax"] as const) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = Math.max(0, Math.min(20000, Math.round(value)));
    }
  }
  if (
    typeof next.priceMin === "number" &&
    typeof next.priceMax === "number" &&
    next.priceMin > next.priceMax
  ) {
    const low = next.priceMax;
    next.priceMax = next.priceMin;
    next.priceMin = low;
  }
  if (source.radiusKm === null) {
    next.radiusKm = null;
  } else if (typeof source.radiusKm === "number" && Number.isFinite(source.radiusKm)) {
    next.radiusKm = Math.max(1, Math.min(25, Math.round(source.radiusKm)));
  }
  if (source.center === null) {
    next.center = null;
  } else if (source.center && typeof source.center === "object") {
    const point = record(source.center);
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      next.center = {
        lat,
        lng,
        label:
          typeof point.label === "string" && point.label.trim()
            ? point.label.trim().slice(0, 120)
            : "Pinned location",
        city: typeof point.city === "string" ? point.city.trim().slice(0, 60) : undefined,
      };
    }
  }
  return next;
}

function publicProfile(profile: Profile, withContact: boolean): Profile {
  return withContact ? profile : { ...profile, email: "" };
}

async function startSession(c: AppContext, profileId: string) {
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = newSessionToken();
  await c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(now.toISOString())
    .run();
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, token_hash, profile_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      await tokenDigest(token),
      profileId,
      now.toISOString(),
      expires.toISOString(),
    )
    .run();

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: new URL(c.req.url).protocol === "https:",
  });
}

async function sessionPayload(db: D1Database, me: Profile) {
  const listings = me.role === "landlord" ? await listListingsForLandlord(db, me.id) : [];
  const listing = listings.find((entry) => !entry.paused && !entry.leased) ?? listings[0] ?? null;
  const trust = await getTrust(db, me.id);
  const mutual = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM matches WHERE status IN ('mutual','accepted') AND (tenant_id = ? OR landlord_id = ?)",
    )
    .bind(me.id, me.id)
    .first<{ n: number }>();
  // Pending requests, from either side of the same row.
  const requests = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM matches WHERE status = 'requested'
       AND (tenant_id = ? OR landlord_id = ?)`,
    )
    .bind(me.id, me.id)
    .first<{ n: number }>();
  return {
    profile: me,
    listing,
    listings,
    trust,
    stats: {
      mutual: mutual?.n ?? 0,
      liked: requests?.n ?? 0,
      requests: requests?.n ?? 0,
    },
  };
}

type LeaseRow = {
  id: string;
  match_id: string;
  reference: string;
  terms: string;
  tenant_signed_at: string | null;
  landlord_signed_at: string | null;
  created_at: string;
};

function mapLease(row: LeaseRow): Lease {
  return {
    id: row.id,
    matchId: row.match_id,
    reference: row.reference,
    createdAt: row.created_at,
    terms: JSON.parse(row.terms),
  };
}

async function getLease(db: D1Database, matchId: string): Promise<Lease | null> {
  const row = await db
    .prepare("SELECT * FROM leases WHERE match_id = ?")
    .bind(matchId)
    .first<LeaseRow>();
  return row ? mapLease(row) : null;
}

async function buildMatchView(
  db: D1Database,
  me: Profile,
  row: MatchDbRow,
): Promise<MatchView | null> {
  const iAmTenant = row.tenant_id === me.id;
  const otherId = iAmTenant ? row.landlord_id : row.tenant_id;
  const other = await getProfile(db, otherId);
  if (!other) return null;
  const listing = row.listing_id
    ? await getListing(db, row.listing_id)
    : await getListingForLandlord(db, row.landlord_id);
  if (!listing) return null;

  const score: ScoreResult = iAmTenant
    ? scoreTenantLandlord(me, other, listing)
    : scoreTenantLandlord(other, me, listing);

  const isMutual = row.status === "mutual" || row.status === "accepted";
  const withContact = isMutual;
  const myRatingRow = await db
    .prepare("SELECT stars, tags, note FROM ratings WHERE match_id = ? AND from_id = ?")
    .bind(row.id, me.id)
    .first<{ stars: number; tags: string; note: string | null }>();

  return {
    id: row.id,
    other: publicProfile(other, withContact),
    listing,
    score,
    status: row.status as MatchView["status"],
    myAction: (iAmTenant ? row.tenant_action : row.landlord_action) as Action,
    theirAction: (iAmTenant ? row.landlord_action : row.tenant_action) as Action,
    viewingAt: row.viewing_at,
    screening: row.screening as ScreeningStatus,
    screeningNote: row.screening_note,
    acceptedAt: row.accepted_at,
    lease: await getLease(db, row.id),
    myRating: myRatingRow
      ? { stars: myRatingRow.stars, tags: parseTags(myRatingRow.tags), note: myRatingRow.note }
      : null,
    iAmTenant,
    createdAt: row.created_at,
    application: isMutual
      ? {
          url: `/api/matches/${row.id}/application.pdf`,
          downloadUrl: `/api/matches/${row.id}/application.pdf?download=1`,
          sentAt: row.application_sent_at ?? row.updated_at,
          fileName: APPLICATION_FILE_NAME,
          checksum: APPLICATION_SHA256,
          ready: applicationPdfBytes() !== null,
        }
      : null,
  };
}

async function findMatch(db: D1Database, id: string): Promise<MatchDbRow | null> {
  return db.prepare("SELECT * FROM matches WHERE id = ?").bind(id).first<MatchDbRow>();
}

async function matchForPair(
  db: D1Database,
  tenantId: string,
  landlordId: string,
): Promise<MatchDbRow | null> {
  return db
    .prepare("SELECT * FROM matches WHERE tenant_id = ? AND landlord_id = ?")
    .bind(tenantId, landlordId)
    .first<MatchDbRow>();
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function logAdmin(
  db: D1Database,
  adminId: string,
  action: string,
  targetId: string | null,
  detail = "",
) {
  await db
    .prepare(
      `INSERT INTO admin_audit (id, admin_id, action, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), adminId, action, targetId, detail, new Date().toISOString())
    .run();
}

/* ------------------------------------------------------------------ health */

app.get("/api/health", (c) =>
  c.json({ ok: true, scoreVersion: SCORE_VERSION, service: "deservia-api" }),
);

/* ----------------------------------------------------------------- accounts */

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

app.post("/api/signup", async (c) => {
  const db = c.env.DB;
  const body = record(await c.req.json().catch(() => ({})));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  const password = body.password;
  const role = body.role;
  const age18 = body.age18 === true;
  const policy = body.policy === true;

  if (name.length < 2 || name.length > 60) {
    return c.json({ error: "Enter your full name." }, 400);
  }
  if (!validEmail(email) || email.length > 160) {
    return c.json({ error: "Enter a valid email address." }, 400);
  }
  if (!validPassword(password)) {
    return c.json({ error: "Use a password of at least 8 characters." }, 400);
  }
  if (role !== "tenant" && role !== "landlord") {
    return c.json({ error: "Choose whether you are a tenant or a landlord." }, 400);
  }
  if (!age18) {
    return c.json({ error: "You must confirm that you are 18 or older." }, 400);
  }
  if (!policy) {
    return c.json({ error: "Accept the privacy policy to create an account." }, 400);
  }

  const existing = await db
    .prepare("SELECT id FROM profiles WHERE lower(email) = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    return c.json({ error: "An account with that email already exists. Log in instead." }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO profiles
       (id, role, name, tagline, email, password_hash, consent_at, status, avatar, accent,
        lifestyle, home, expectations, excluded, demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, '', '[]', 0, ?)`,
    )
    .bind(
      id,
      role,
      name,
      role === "landlord" ? "New landlord on Deservia" : "New to Deservia",
      email,
      await hashPassword(password),
      now,
      role === "landlord" ? "🏡" : "🙂",
      role === "landlord" ? "#1a1a5e,#5b5bd6" : "#a4123f,#ff5c97",
      JSON.stringify({
        ...DEFAULT_LIFESTYLE,
        issueSpeed: role === "landlord" ? "24h" : undefined,
      }),
      role === "tenant" ? JSON.stringify(DEFAULT_HOME) : null,
      now,
    )
    .run();

  await startSession(c, id);
  const created = (await getProfile(db, id)) as Profile;
  return c.json(await sessionPayload(db, created));
});

app.post("/api/login", async (c) => {
  const body = record(await c.req.json().catch(() => ({})));
  const email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return c.json({ error: "Enter your email and password." }, 400);
  }

  const row = await c.env.DB.prepare("SELECT * FROM profiles WHERE lower(email) = ?")
    .bind(email)
    .first<ProfileRow>();
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    return c.json({ error: "Email or password is incorrect." }, 401);
  }
  if (row.status !== "active") {
    return c.json(
      { error: "This account is suspended. Contact Deservia support to appeal." },
      403,
    );
  }

  await startSession(c, row.id);
  return c.json(await sessionPayload(c.env.DB, mapProfile(row)));
});

app.delete("/api/session", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await tokenDigest(token))
      .run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/* ----------------------------------------------------------------- profile */

app.get("/api/me", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  return c.json(await sessionPayload(c.env.DB, me));
});

app.put("/api/me", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();

  const body = record(await c.req.json().catch(() => ({})));
  const lifestyle = pickLifestyle(body.lifestyle, me.lifestyle);
  const home =
    me.role === "admin" ? null : pickHome(body.home, me.home ?? DEFAULT_HOME);

  // The quiz address is geocoded the same way a listing is. A bad address is
  // blocked instead of being saved without a point.
  if (home && home.address && home.postalCode) {
    if (!validPostal(home.postalCode)) {
      return c.json({ error: "Enter a valid Canadian postal code, e.g. L6Y 1A1." }, 400);
    }
    const point = geocodeAddress({
      city: home.area,
      street: home.address,
      unit: home.unit,
      postalCode: home.postalCode,
    });
    if (!point) {
      return c.json(
        { error: "We couldn't match that address. Check the street, city and postal code." },
        422,
      );
    }
    home.postalCode = point.postalCode;
    home.center = { lat: point.lat, lng: point.lng, label: point.label, city: home.area };
    home.radiusKm = home.radiusKm ?? 5;
  }
  const expectations =
    typeof body.expectations === "string" ? body.expectations.slice(0, 600) : me.expectations;
  const name =
    typeof body.name === "string" && body.name.trim().length >= 2
      ? body.name.trim().slice(0, 60)
      : me.name;
  const tagline =
    typeof body.tagline === "string" ? body.tagline.trim().slice(0, 120) : me.tagline;
  let excluded = me.excluded;
  if (Array.isArray(body.excluded)) {
    excluded = body.excluded
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 200))
      .slice(0, 3);
  }

  await c.env.DB.prepare(
    "UPDATE profiles SET name = ?, tagline = ?, lifestyle = ?, home = ?, expectations = ?, excluded = ? WHERE id = ?",
  )
    .bind(
      name,
      tagline,
      JSON.stringify(lifestyle),
      home ? JSON.stringify(home) : null,
      expectations,
      JSON.stringify(excluded),
      me.id,
    )
    .run();

  const updated = (await getProfile(c.env.DB, me.id)) as Profile;
  return c.json(await sessionPayload(c.env.DB, updated));
});

app.delete("/api/me", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const id = me.id;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE profile_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM ratings WHERE from_id = ? OR to_id = ?").bind(id, id),
    c.env.DB.prepare("DELETE FROM reports WHERE reporter_id = ? OR subject_id = ?").bind(id, id),
    c.env.DB.prepare("DELETE FROM data_requests WHERE profile_id = ?").bind(id),
    c.env.DB.prepare(
      "DELETE FROM leases WHERE match_id IN (SELECT id FROM matches WHERE tenant_id = ? OR landlord_id = ?)",
    ).bind(id, id),
    c.env.DB.prepare("DELETE FROM matches WHERE tenant_id = ? OR landlord_id = ?").bind(id, id),
    c.env.DB.prepare("DELETE FROM listings WHERE landlord_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM profiles WHERE id = ?").bind(id),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true, message: "Your profile and data were deleted." });
});

/* ----------------------------------------------------------------- listing */

const LISTING_AREAS = AREAS;
const PET_POLICIES = ["dog", "cat", "other", "none", "no_preference", "loves_none"];
const SMOKING_POLICIES = ["non", "outside", "smoker", "no_preference"];

const LAUNDRY_OPTIONS = ["In-suite laundry", "Shared laundry", "Coin laundry in building", "No laundry"];
const ENTRANCE_OPTIONS = ["Separate entrance", "Shared entrance"];
const KITCHEN_OPTIONS = ["Private kitchen", "Shared kitchen", "Kitchenette"];
const OUTDOOR_OPTIONS = ["Backyard", "Shared backyard", "Balcony", "Patio / deck", "No outdoor space"];
const FLOOR_OPTIONS = ["Basement", "Ground / main floor", "Upper floor", "High-rise unit"];
const HEATING_OPTIONS = [
  "Central air + heat",
  "Heat only",
  "Window / portable A/C",
  "Baseboard heat",
];
const PARKING_DETAILS = [
  "No parking",
  "Street parking",
  "1 parking spot",
  "2+ parking spots",
  "Garage",
];
const PET_DETAILS = ["Pets welcome", "Cats only", "Dogs only", "Small pets only", "No pets"];
const SMOKING_DETAILS = ["Non-smoking", "Smoking outside only", "Smoking allowed"];
const PARKING_ENGINE: Record<string, string> = {
  "No parking": "none",
  "Street parking": "street",
  "1 parking spot": "included",
  "2+ parking spots": "included",
  Garage: "included",
};
const PET_ENGINE: Record<string, string> = {
  "Pets welcome": "loves_pets",
  "Cats only": "cat",
  "Dogs only": "dog",
  "Small pets only": "other",
  "No pets": "none",
};
const SMOKING_ENGINE: Record<string, string> = {
  "Non-smoking": "non",
  "Smoking outside only": "outside",
  "Smoking allowed": "smoker",
};

function cleanList(value: unknown, max = 20, maxLength = 60): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, max);
}

function pickDetail(value: unknown, allowed: string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function deriveAvailable(date: string | null): string {
  if (!date) return "flexible";
  const when = new Date(`${date}T12:00:00Z`).getTime();
  if (Number.isNaN(when)) return "flexible";
  const days = (when - Date.now()) / 86_400_000;
  if (days <= 31) return "within_month";
  if (days <= 93) return "1_3_months";
  return "flexible";
}

const PHOTO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

app.post("/api/me/listing", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  if (me.role !== "landlord") {
    return c.json({ error: "Only landlord accounts can publish a listing." }, 403);
  }

  const body = record(await c.req.json().catch(() => ({})));
  const rent = Number(body.rent);
  const area = String(body.area ?? "");
  const spaceType = String(body.spaceType ?? "");
  const lease = String(body.lease ?? "");
  const furnished = String(body.furnished ?? "");
  const bedrooms = Number(body.bedrooms);
  const washrooms = Number(body.washrooms);
  const availableFrom =
    typeof body.availableFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.availableFrom)
      ? body.availableFrom
      : null;
  const sizeSqft = Number(body.sizeSqft);

  if (!LISTING_AREAS.includes(area)) {
    return c.json({ error: "Choose an area." }, 400);
  }

  const street = typeof body.address === "string" ? body.address.trim().slice(0, 160) : "";
  const unit = typeof body.unit === "string" ? body.unit.trim().slice(0, 20) : "";
  const postalCodeRaw = typeof body.postalCode === "string" ? body.postalCode : "";
  if (street.length < 4) {
    return c.json({ error: "Enter the street address, e.g. 123 Main St." }, 400);
  }
  if (!validPostal(postalCodeRaw)) {
    return c.json({ error: "Enter a valid Canadian postal code, e.g. L6Y 1A1." }, 400);
  }
  const point = geocodeAddress({ city: area, street, unit, postalCode: postalCodeRaw });
  if (!point) {
    return c.json(
      {
        error: "We couldn't geocode that address. Correct the street or postal code and try again.",
        geocodeFailed: true,
      },
      422,
    );
  }
  if (!Number.isFinite(rent) || rent < 200 || rent > 20000) {
    return c.json({ error: "Enter a monthly rent between $200 and $20,000." }, 400);
  }
  if (!HOME_VALUES.spaceType.includes(spaceType)) {
    return c.json({ error: "Choose a rental type." }, 400);
  }
  if (!HOME_VALUES.lease.includes(lease)) {
    return c.json({ error: "Choose a lease length." }, 400);
  }
  if (!HOME_VALUES.furnished.includes(furnished)) {
    return c.json({ error: "Choose whether the unit is furnished." }, 400);
  }
  const parkingDetail = pickDetail(body.parkingDetail, PARKING_DETAILS);
  if (!parkingDetail) {
    return c.json({ error: "Choose the parking situation." }, 400);
  }
  const laundry = pickDetail(body.laundry, LAUNDRY_OPTIONS);
  if (!laundry) {
    return c.json({ error: "Choose the laundry situation." }, 400);
  }
  const petsDetail = pickDetail(body.petsDetail, PET_DETAILS);
  if (!petsDetail) {
    return c.json({ error: "Choose a pet policy." }, 400);
  }
  const smokingDetail = pickDetail(body.smokingDetail, SMOKING_DETAILS);
  if (!smokingDetail) {
    return c.json({ error: "Choose a smoking policy." }, 400);
  }
  const entrance = pickDetail(body.entrance, ENTRANCE_OPTIONS);
  if (!entrance) {
    return c.json({ error: "Choose the entrance." }, 400);
  }
  const kitchen = pickDetail(body.kitchen, KITCHEN_OPTIONS);
  if (!kitchen) {
    return c.json({ error: "Choose the kitchen." }, 400);
  }
  const outdoor = pickDetail(body.outdoor, OUTDOOR_OPTIONS);
  if (!outdoor) {
    return c.json({ error: "Choose the outdoor space." }, 400);
  }
  const floorLevel = pickDetail(body.floorLevel, FLOOR_OPTIONS);
  if (!floorLevel) {
    return c.json({ error: "Choose the floor or level." }, 400);
  }
  const heatingCooling = pickDetail(body.heatingCooling, HEATING_OPTIONS);
  if (!heatingCooling) {
    return c.json({ error: "Choose the heating and cooling." }, 400);
  }
  if (!availableFrom) {
    return c.json({ error: "Choose the date the unit is available from." }, 400);
  }
  if (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 5) {
    return c.json({ error: "Choose the number of bedrooms." }, 400);
  }
  if (![1, 1.5, 2, 2.5, 3].includes(washrooms)) {
    return c.json({ error: "Choose the number of washrooms." }, 400);
  }
  if (!Number.isFinite(sizeSqft) || sizeSqft < 100 || sizeSqft > 20000) {
    return c.json({ error: "Enter the size in square feet (100 to 20,000)." }, 400);
  }

  const petsPolicy = PET_ENGINE[petsDetail];
  const smokingPolicy = SMOKING_ENGINE[smokingDetail];
  const parking = PARKING_ENGINE[parkingDetail];
  const available = deriveAvailable(availableFrom);

  const utilities = cleanList(body.utilities, 10, 40);
  const amenities = cleanList(body.amenities, 20, 60);
  const photos = Array.isArray(body.photos)
    ? body.photos
        .filter((item): item is string => typeof item === "string" && PHOTO_PATTERN.test(item))
        .filter((item) => item.length <= 260000)
        .slice(0, 3)
    : [];

  const washroomsDetail =
    typeof body.washroomsDetail === "string" ? body.washroomsDetail.slice(0, 40) : null;
  const blurb = typeof body.blurb === "string" ? body.blurb.trim().slice(0, 600) : "";
  const suppliedTitle = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
  const generatedTitle = `${bedrooms === 0 ? "Studio" : `${bedrooms} bedroom`} ${
    label("spaceType", spaceType).toLowerCase()
  } in ${area}`;
  const title = suppliedTitle.length >= 4 ? suppliedTitle : generatedTitle.slice(0, 80);

  // A landlord edits the listing named in the form, and a save without an id
  // creates a new listing under the same account.
  const requestedId = typeof body.id === "string" ? body.id : "";
  const existing = requestedId ? await getListing(c.env.DB, requestedId) : null;
  if (requestedId && (!existing || existing.landlordId !== me.id)) {
    return c.json({ error: "Listing not found." }, 404);
  }
  const newListingId = crypto.randomUUID();
  const savedListingId = existing?.id ?? newListingId;
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE listings SET title = ?, blurb = ?, rent = ?, area = ?, space_type = ?, bedrooms = ?,
       washrooms = ?, parking = ?, furnished = ?, lease = ?, available = ?, pets_policy = ?,
       smoking_policy = ?, amenities = ?, available_from = ?, size_sqft = ?, floor_level = ?,
       heating_cooling = ?, laundry = ?, utilities = ?, entrance = ?, kitchen = ?, outdoor = ?,
       photos = ?, parking_detail = ?, pets_detail = ?, smoking_detail = ?, washrooms_detail = ?,
       address = ?, unit = ?, postal_code = ?, lat = ?, lng = ?
       WHERE id = ?`,
    )
      .bind(
        title,
        blurb,
        Math.round(rent),
        area,
        spaceType,
        bedrooms,
        washrooms,
        parking,
        furnished,
        lease,
        available,
        petsPolicy,
        smokingPolicy,
        JSON.stringify(amenities),
        availableFrom,
        Math.round(sizeSqft),
        floorLevel,
        heatingCooling,
        laundry,
        JSON.stringify(utilities),
        entrance,
        kitchen,
        outdoor,
        JSON.stringify(photos),
        parkingDetail,
        petsDetail,
        smokingDetail,
        washroomsDetail,
        street,
        unit || null,
        point.postalCode,
        point.lat,
        point.lng,
        existing.id,
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO listings
       (id, landlord_id, title, blurb, rent, emoji, accent, area, space_type, bedrooms, washrooms,
        parking, furnished, lease, available, pets_policy, smoking_policy, amenities, available_from,
        size_sqft, floor_level, heating_cooling, laundry, utilities, entrance, kitchen, outdoor,
        photos, parking_detail, pets_detail, smoking_detail, washrooms_detail,
        address, unit, postal_code, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newListingId,
        me.id,
        title,
        blurb,
        Math.round(rent),
        me.avatar || "🏡",
        me.accent,
        area,
        spaceType,
        bedrooms,
        washrooms,
        parking,
        furnished,
        lease,
        available,
        petsPolicy,
        smokingPolicy,
        JSON.stringify(amenities),
        availableFrom,
        Math.round(sizeSqft),
        floorLevel,
        heatingCooling,
        laundry,
        JSON.stringify(utilities),
        entrance,
        kitchen,
        outdoor,
        JSON.stringify(photos),
        parkingDetail,
        petsDetail,
        smokingDetail,
        washroomsDetail,
        street,
        unit || null,
        point.postalCode,
        point.lat,
        point.lng,
      )
      .run();
  }

  const updated = (await getProfile(c.env.DB, me.id)) as Profile;
  return c.json({ ...(await sessionPayload(c.env.DB, updated)), savedListingId });
});

app.post("/api/me/listing/state", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  if (me.role !== "landlord") return c.json({ error: "Landlord only." }, 403);
  const body = record(await c.req.json().catch(() => ({})));
  const requestedId = typeof body.id === "string" ? body.id : "";
  const listing = requestedId
    ? await getListing(c.env.DB, requestedId)
    : await getListingForLandlord(c.env.DB, me.id);
  if (!listing || listing.landlordId !== me.id) {
    return c.json({ error: "You do not have a listing yet." }, 404);
  }
  const paused = typeof body.paused === "boolean" ? body.paused : listing.paused;
  const leased = typeof body.leased === "boolean" ? body.leased : listing.leased;
  await c.env.DB.prepare("UPDATE listings SET paused = ?, leased = ? WHERE id = ?")
    .bind(paused ? 1 : 0, leased ? 1 : 0, listing.id)
    .run();
  return c.json(await sessionPayload(c.env.DB, me));
});

/* --------------------------------------------------------- recommendations */

app.get("/api/recommendations", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const db = c.env.DB;

  if (me.role === "tenant") {
    const home = me.home ?? DEFAULT_HOME;
    const [landlords, { results }] = await Promise.all([
      listLandlords(db),
      db.prepare("SELECT * FROM matches WHERE tenant_id = ?").bind(me.id).all<MatchDbRow>(),
    ]);
    const byLandlord = new Map((results ?? []).map((row) => [row.landlord_id, row]));

    const lat = Number(c.req.query("lat"));
    const lng = Number(c.req.query("lng"));
    const override =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

    // Filters and the radius decide who is eligible; the scoring matrix below
    // is untouched apart from its published distance criterion.
    const { point, radiusKm } = tenantOrigin(home, override);

    type Candidate = {
      profile: Profile;
      listing: Listing;
      row: MatchDbRow | undefined;
      score: ScoreResult;
      distanceKm: number | null;
      inside: boolean;
    };

    const candidates: Candidate[] = [];
    for (const { profile, listing } of landlords) {
      const row = byLandlord.get(profile.id);
      // Listings a tenant declined or withdrew never come back.
      if (row && (row.status === "declined" || row.status === "withdrawn")) continue;
      if (!passesTenantFilters(listing, home)) continue;
      const away = distanceToListing(listing, point);
      const inside =
        radiusKm !== null && away !== null
          ? away <= radiusKm
          : !home.area || listing.area === home.area;
      candidates.push({
        profile,
        listing,
        row,
        score: scoreTenantLandlord(me, profile, listing),
        distanceKm: away,
        inside,
      });
    }

    // Highest score first; ties go to the closer listing.
    const order = (a: Candidate, b: Candidate) =>
      b.score.score - a.score.score ||
      (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER) ||
      a.listing.title.localeCompare(b.listing.title);

    const inRadius = candidates.filter((entry) => entry.inside).sort(order);
    const outside = candidates.filter((entry) => !entry.inside).sort(order);
    const shortPool = candidates.length < 10;
    const deck = shortPool
      ? [...inRadius, ...outside]
      : inRadius.length >= 10
        ? inRadius.slice(0, 10)
        : [...inRadius, ...outside.slice(0, 10 - inRadius.length)];

    const items: Recommendation[] = deck.map((entry, index) => ({
      other: publicProfile(
        entry.profile,
        entry.row?.status === "mutual" || entry.row?.status === "accepted",
      ),
      listing: entry.listing,
      score: entry.score,
      match: entry.row
        ? {
            id: entry.row.id,
            myAction: entry.row.tenant_action as Action,
            theirAction: entry.row.landlord_action as Action,
            status: entry.row.status as MatchView["status"],
          }
        : null,
      rank: index + 1,
      distanceKm: entry.distanceKm,
      outsideRadius: !entry.inside,
      ...(entry.inside ? {} : { fallback: true }),
    }));

    const summary = buildFilterSummary({
      home,
      radiusKm,
      centerLabel: point?.label ?? null,
      survived: inRadius.length,
      fallbackCount: deck.filter((entry) => !entry.inside).length,
      poolSize: candidates.length,
      shortPool,
    });

    return c.json({
      role: me.role,
      items,
      weights: WEIGHTS,
      excluded: me.excluded,
      listing: null,
      listings: [],
      filters: summary,
    });
  }

  if (me.role === "landlord") {
    return c.json(
      { error: "Landlords respond to tenant requests. There is no tenant deck." },
      403,
    );
  }

  return c.json({ error: "Admin accounts do not get a match deck." }, 403);
});

/* ------------------------------------------------------ landlord requests */

/**
 * One landlord's requests for one listing. Only tenants who liked the listing
 * appear here; there is no way for a landlord to browse tenants.
 */
app.get("/api/requests", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  if (me.role !== "landlord") {
    return c.json({ error: "Requests are for landlord accounts." }, 403);
  }
  const db = c.env.DB;
  const listings = await listListingsForLandlord(db, me.id);
  const requestedId = c.req.query("listingId");
  const listing =
    listings.find((entry) => entry.id === requestedId) ??
    listings.find((entry) => !entry.paused && !entry.leased) ??
    listings[0] ??
    null;

  if (!listing) {
    return c.json({ listing: null, listings: [], requests: [], pending: 0 });
  }

  const { results } = await db
    .prepare("SELECT * FROM matches WHERE landlord_id = ? ORDER BY updated_at DESC")
    .bind(me.id)
    .all<MatchDbRow>();

  const firstListingId = listings[0]?.id ?? null;
  const requests: MatchView[] = [];
  let pending = 0;
  for (const row of results ?? []) {
    const belongsTo = row.listing_id ?? firstListingId;
    if (belongsTo !== listing.id) continue;
    if (
      row.status !== "requested" &&
      row.status !== "mutual" &&
      row.status !== "accepted"
    ) {
      continue;
    }
    const view = await buildMatchView(db, me, row);
    if (!view) continue;
    if (row.status === "requested") pending += 1;
    requests.push(view);
  }

  return c.json({ listing, listings, requests, pending });
});

/* ----------------------------------------------------------------- matches */

app.get("/api/matches", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  if (me.role === "admin") {
    return c.json({ error: "Admins review matches in aggregate, not as a user." }, 403);
  }
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM matches WHERE tenant_id = ? OR landlord_id = ? ORDER BY updated_at DESC",
  )
    .bind(me.id, me.id)
    .all<MatchDbRow>();

  const views: MatchView[] = [];
  for (const row of results ?? []) {
    const view = await buildMatchView(c.env.DB, me, row);
    if (view) views.push(view);
  }

  const buckets = {
    mutual: views.filter((v) => v.status === "mutual" || v.status === "accepted"),
    // A landlord's incoming requests are the tenants who liked the listing.
    incoming: views.filter((v) => v.status === "requested" && !v.iAmTenant),
    outgoing: views.filter((v) => v.status === "requested" && v.iAmTenant),
    closed: views.filter((v) => v.status === "declined" || v.status === "withdrawn"),
  };
  return c.json({ ...buckets, me: me.role });
});

app.post("/api/interest", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const otherId = body.profileId;
  const action = body.action;
  if (typeof otherId !== "string" || (action !== "like" && action !== "pass")) {
    return c.json({ error: "profileId and action ('like' or 'pass') are required." }, 400);
  }
  const other = await getProfile(c.env.DB, otherId);
  if (!other) return c.json({ error: "Profile not found." }, 404);

  // Matching only ever starts from the tenant. A landlord-initiated like is
  // refused even if the UI is bypassed.
  if (me.role !== "tenant" || other.role !== "landlord") {
    return c.json(
      { error: "Only tenants can start a match. Landlords respond to requests." },
      403,
    );
  }

  const tenantId = me.id;
  const landlordId = other.id;
  // The deck sends the exact listing that was swiped, so a tenant can like
  // several homes from one landlord. Older clients only send profileId.
  const requestedListingId = typeof body.listingId === "string" ? body.listingId : "";
  const listing = requestedListingId
    ? await getListing(c.env.DB, requestedListingId)
    : await getListingForLandlord(c.env.DB, landlordId);
  if (!listing || listing.landlordId !== landlordId) {
    return c.json({ error: "That landlord does not have an active listing." }, 400);
  }

  const existing = await matchForPair(c.env.DB, tenantId, landlordId);
  const now = new Date().toISOString();
  const id = existing?.id ?? crypto.randomUUID();

  if (action === "pass") {
    await c.env.DB.prepare("DELETE FROM listing_likes WHERE tenant_id = ? AND listing_id = ?")
      .bind(tenantId, listing.id)
      .run();

    // Passing one home does not withdraw a request while other homes from the
    // same landlord are still liked.
    if (existing) {
      const remaining = await c.env.DB.prepare(
        `SELECT listing_id FROM listing_likes
         WHERE tenant_id = ? AND landlord_id = ? ORDER BY created_at`,
      )
        .bind(tenantId, landlordId)
        .first<{ listing_id: string }>();
      if (remaining) {
        await c.env.DB.prepare("UPDATE matches SET listing_id = ?, updated_at = ? WHERE id = ?")
          .bind(remaining.listing_id, now, existing.id)
          .run();
        return c.json({
          ok: true,
          matchId: existing.id,
          status: existing.status,
          otherName: other.name,
        });
      }
    }

    if (!existing) {
      await c.env.DB.prepare(
        `INSERT INTO matches
         (id, tenant_id, landlord_id, tenant_action, landlord_action, status, listing_id, created_at, updated_at)
         VALUES (?, ?, ?, 'pass', 'pending', 'withdrawn', ?, ?, ?)`,
      )
        .bind(id, tenantId, landlordId, listing.id, now, now)
        .run();
    } else {
      if (existing.status === "mutual" || existing.status === "accepted") {
        return c.json(
          { error: "The landlord already accepted this request. Cancel the match instead." },
          400,
        );
      }
      await c.env.DB.prepare(
        "UPDATE matches SET tenant_action = 'pass', status = 'withdrawn', updated_at = ? WHERE id = ?",
      )
        .bind(now, existing.id)
        .run();
    }
    return c.json({ ok: true, matchId: id, status: "withdrawn", otherName: other.name });
  }

  if (existing?.status === "declined") {
    return c.json({ error: "This listing is no longer available to you." }, 403);
  }
  if (existing?.status === "mutual" || existing?.status === "accepted") {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO listing_likes (id, tenant_id, listing_id, landlord_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), tenantId, listing.id, landlordId, now)
      .run();
    return c.json({
      ok: true,
      matchId: existing.id,
      status: existing.status,
      otherName: other.name,
    });
  }

  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO matches
       (id, tenant_id, landlord_id, tenant_action, landlord_action, status, listing_id, created_at, updated_at)
       VALUES (?, ?, ?, 'like', 'pending', 'requested', ?, ?, ?)`,
    )
      .bind(id, tenantId, landlordId, listing.id, now, now)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE matches SET tenant_action = 'like', landlord_action = 'pending', status = 'requested',
       listing_id = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(listing.id, now, existing.id)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO listing_likes (id, tenant_id, listing_id, landlord_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), tenantId, listing.id, landlordId, now)
    .run();

  await notify(
    c.env.DB,
    landlordId,
    "request",
    `${me.name} sent a request for ${listing.title}. Accept or decline it on your Requests page.`,
    "/app/requests",
  );

  return c.json({ ok: true, matchId: id, status: "requested", otherName: other.name });
});

app.post("/api/matches/:id/withdraw", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status === "accepted") {
    return c.json({ error: "A signed match cannot be withdrawn here." }, 400);
  }
  if (row.landlord_id === me.id && row.status === "requested") {
    return c.json(
      { error: "A landlord answers a request with Accept or Decline." },
      403,
    );
  }
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE matches SET status = 'withdrawn', viewing_at = NULL, updated_at = ? WHERE id = ?",
    ).bind(now, row.id),
    c.env.DB.prepare(
      "UPDATE viewings SET status = 'cancelled', updated_at = ? WHERE match_id = ? AND status IN ('proposed','confirmed','rescheduled')",
    ).bind(now, row.id),
  ]);
  const otherId = row.tenant_id === me.id ? row.landlord_id : row.tenant_id;
  await notify(
    c.env.DB,
    otherId,
    "match_withdrawn",
    `${me.name} withdrew from this match.`,
    otherId === row.landlord_id ? "/app/requests" : "/app/matches",
  );
  return c.json({ ok: true, status: "withdrawn" });
});

/**
 * The landlord answers a tenant's request. Accept makes it mutual and unlocks
 * the application PDF and scheduling for both sides; decline closes it.
 */
app.post("/api/matches/:id/request", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const decision = body.decision === "accept" ? "accept" : body.decision === "decline" ? "decline" : null;
  if (!decision) return c.json({ error: "Send decision: 'accept' or 'decline'." }, 400);

  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Request not found." }, 404);
  if (row.landlord_id !== me.id) {
    return c.json({ error: "Only the landlord answers this request." }, 403);
  }
  if (row.status !== "requested") {
    return c.json({ error: "This request has already been answered." }, 400);
  }

  const tenant = await getProfile(c.env.DB, row.tenant_id);
  const listing = row.listing_id
    ? await getListing(c.env.DB, row.listing_id)
    : await getListingForLandlord(c.env.DB, row.landlord_id);
  if (!tenant || !listing) return c.json({ error: "Request data is incomplete." }, 400);

  const now = new Date().toISOString();

  if (decision === "decline") {
    await c.env.DB.prepare(
      "UPDATE matches SET status = 'declined', updated_at = ? WHERE id = ?",
    )
      .bind(now, row.id)
      .run();
    await notify(
      c.env.DB,
      tenant.id,
      "request_declined",
      `${listing.title} is no longer available to you.`,
      "/app/matches",
    );
    return c.json({ ok: true, status: "declined" });
  }

  await c.env.DB.prepare(
    `UPDATE matches SET status = 'mutual', landlord_action = 'like',
     application_sent_at = COALESCE(application_sent_at, ?), updated_at = ? WHERE id = ?`,
  )
    .bind(now, now, row.id)
    .run();

  const score = scoreTenantLandlord(tenant, me, listing);
  await c.env.DB.prepare(
    "UPDATE matches SET score_snapshot = ?, score_at = ? WHERE id = ? AND score_snapshot IS NULL",
  )
    .bind(JSON.stringify(score), now, row.id)
    .run();

  await notify(
    c.env.DB,
    tenant.id,
    "request_accepted",
    `${me.name} accepted your request for ${listing.title}. Fill out the rental application and schedule a viewing.`,
    "/app/matches",
  );

  return c.json({ ok: true, status: "mutual", view: await buildMatchView(c.env.DB, me, { ...row, status: "mutual", landlord_action: "like" }) });
});

app.post("/api/matches/:id/screening", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const result = body.result === "flagged" ? "flagged" : "passed";
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id) {
    return c.json({ error: "The tenant runs their own screening." }, 403);
  }
  if (row.status !== "mutual") return c.json({ error: "Screening starts after a mutual match." }, 400);
  if (!row.viewing_at) {
    return c.json({ error: "Book a viewing before running screening." }, 400);
  }
  const note =
    result === "passed"
      ? "SingleKey demo check: job, income and credit confirmed. Result only — no report stored."
      : "SingleKey demo check flagged a mismatch. The tenant can add documents and try again.";
  await c.env.DB.prepare(
    "UPDATE matches SET screening = ?, screening_note = ?, updated_at = ? WHERE id = ?",
  )
    .bind(result, note, new Date().toISOString(), row.id)
    .run();
  return c.json({ ok: true, screening: result, note });
});

app.post("/api/matches/:id/accept", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.landlord_id !== me.id) {
    return c.json({ error: "The landlord makes the final choice." }, 403);
  }
  if (row.status !== "mutual") return c.json({ error: "Only a mutual match can be accepted." }, 400);
  if (row.screening !== "passed") {
    return c.json({ error: "Wait for the tenant's screening to pass before accepting." }, 400);
  }

  const tenant = await getProfile(c.env.DB, row.tenant_id);
  const listing = await getListingForLandlord(c.env.DB, row.landlord_id);
  if (!tenant || !listing) return c.json({ error: "Match data is incomplete." }, 400);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE matches SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(now, now, row.id)
    .run();

  const existing = await getLease(c.env.DB, row.id);
  if (!existing) {
    const start = new Date();
    start.setMonth(start.getMonth() + 1, 1);
    const terms = {
      landlordName: me.name,
      tenantName: tenant.name,
      unitTitle: listing.title,
      area: listing.area,
      rent: listing.rent,
      term: label("lease", listing.lease),
      startDate: start.toISOString().slice(0, 10),
      deposit: listing.rent,
      included: listing.amenities.filter((item) =>
        /included|parking|laundry|utilities/i.test(item),
      ),
      pets: label("pets", listing.petsPolicy),
      smoking: label("smoking", listing.smokingPolicy),
      landlordSignature: null,
      tenantSignature: null,
    };
    await c.env.DB.prepare(
      `INSERT INTO leases (id, match_id, reference, terms, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        row.id,
        `ON-STD-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        JSON.stringify(terms),
        now,
      )
      .run();
  }

  return c.json({ ok: true, status: "accepted", lease: await getLease(c.env.DB, row.id) });
});

app.post("/api/matches/:id/sign", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status !== "accepted") {
    return c.json({ error: "The landlord must accept before signing." }, 400);
  }
  const lease = await getLease(c.env.DB, row.id);
  if (!lease) return c.json({ error: "Lease not generated yet." }, 400);

  const signedAt = new Date().toISOString();
  const signature = `${me.name} · ${signedAt}`;
  const terms = { ...lease.terms };
  const iAmTenant = row.tenant_id === me.id;
  if (iAmTenant) terms.tenantSignature = signature;
  else terms.landlordSignature = signature;

  await c.env.DB.prepare(
    `UPDATE leases SET terms = ?, tenant_signed_at = COALESCE(?, tenant_signed_at),
     landlord_signed_at = COALESCE(?, landlord_signed_at) WHERE id = ?`,
  )
    .bind(
      JSON.stringify(terms),
      iAmTenant ? signedAt : null,
      iAmTenant ? null : signedAt,
      lease.id,
    )
    .run();

  return c.json({ ok: true, lease: await getLease(c.env.DB, row.id) });
});

/* ----------------------------------------------------------------- ratings */

const BLOCKED_TERMS = [
  "no kids",
  "no children",
  "family status",
  "disabled",
  "wheelchair",
  "religion",
  "muslim",
  "christian",
  "jewish",
  "hindu",
  "sikh",
  "race",
  "immigrant",
  "welfare",
  "on assistance",
  "single mother",
  "no pets allowed because",
];

app.post("/api/matches/:id/rate", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return c.json({ error: "Choose between 1 and 5 stars." }, 400);
  }
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status !== "accepted") {
    return c.json({ error: "Ratings open once the match is accepted." }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM ratings WHERE match_id = ? AND from_id = ?",
  )
    .bind(row.id, me.id)
    .first<{ id: string }>();
  if (existing) return c.json({ error: "You already rated this match." }, 400);

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const lower = note.toLowerCase();
  if (BLOCKED_TERMS.some((term) => lower.includes(term))) {
    return c.json(
      {
        error:
          "That note mentions a protected ground. Ratings are about the transaction, never who someone is.",
        blocked: true,
      },
      422,
    );
  }

  const iAmTenant = row.tenant_id === me.id;
  const otherId = iAmTenant ? row.landlord_id : row.tenant_id;
  const other = await getProfile(c.env.DB, otherId);
  if (!other) return c.json({ error: "Match data is incomplete." }, 400);

  const allowedTags = iAmTenant ? RATING_TAGS.landlord : RATING_TAGS.tenant;
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string" && allowedTags.includes(tag))
    : [];

  await c.env.DB.prepare(
    `INSERT INTO ratings (id, match_id, from_id, to_id, role, stars, tags, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      row.id,
      me.id,
      otherId,
      other.role === "landlord" ? "landlord" : "tenant",
      stars,
      JSON.stringify(tags),
      note || null,
      new Date().toISOString(),
    )
    .run();

  return c.json({ ok: true, trust: await getTrust(c.env.DB, otherId) });
});

app.get("/api/trust/:id", async (c) => {
  const profile = await getProfile(c.env.DB, c.req.param("id"));
  if (!profile) return c.json({ error: "Profile not found." }, 404);
  return c.json({ profile, trust: await getTrust(c.env.DB, profile.id) });
});

/* ------------------------------------------------------- reports & appeals */

app.post("/api/reports", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const subjectId = body.subjectId;
  const reason = body.reason;
  if (typeof subjectId !== "string" || typeof reason !== "string" || !reason.trim()) {
    return c.json({ error: "Choose a reason for the report." }, 400);
  }
  if (subjectId === me.id) return c.json({ error: "You cannot report yourself." }, 400);
  const subject = await getProfile(c.env.DB, subjectId);
  if (!subject) return c.json({ error: "Profile not found." }, 404);

  await c.env.DB.prepare(
    `INSERT INTO reports (id, reporter_id, subject_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`,
  )
    .bind(
      crypto.randomUUID(),
      me.id,
      subjectId,
      reason.slice(0, 120),
      typeof body.details === "string" ? body.details.slice(0, 600) : "",
      new Date().toISOString(),
    )
    .run();

  return c.json({
    ok: true,
    message: "Report received privately. Deservia reviews it; it never appears on anyone's profile.",
  });
});

function requireAdmin(c: AppContext): Profile | null {
  const me = c.get("me");
  return me && me.role === "admin" ? me : null;
}

app.get("/api/admin/reports", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, rp.name AS reporter_name, sp.name AS subject_name
     FROM reports r
     LEFT JOIN profiles rp ON rp.id = r.reporter_id
     LEFT JOIN profiles sp ON sp.id = r.subject_id
     ORDER BY r.created_at DESC`,
  ).all<{
    id: string;
    reason: string;
    details: string;
    status: string;
    created_at: string;
    reporter_name: string | null;
    subject_name: string | null;
  }>();

  const reports: ReportRow[] = (results ?? []).map((row) => ({
    id: row.id,
    reporterName: row.reporter_name ?? "Deleted user",
    subjectName: row.subject_name ?? "Deleted user",
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
  }));
  return c.json({ reports });
});

app.post("/api/admin/reports/:id/resolve", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin only." }, 403);
  const body = record(await c.req.json().catch(() => ({})));
  const action = body.action === "remove" ? "removed" : "resolved";
  const resolution =
    typeof body.resolution === "string" && body.resolution.trim()
      ? body.resolution.slice(0, 400)
      : action === "removed"
        ? "Conduct breach confirmed — account removed. Appeal available free of charge."
        : "Reviewed by Deservia support — no further action.";

  const result = await c.env.DB.prepare(
    "UPDATE reports SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?",
  )
    .bind(action, resolution, new Date().toISOString(), c.req.param("id"))
    .run();

  if (!result.meta.changes) return c.json({ error: "Report not found." }, 404);
  await logAdmin(c.env.DB, admin.id, "report_resolved", c.req.param("id"), action);
  return c.json({ ok: true, status: action, resolution });
});

/* ------------------------------------------------------------ admin: data */

type AdminUserRow = {
  id: string;
  role: string;
  name: string;
  email: string;
  status: string;
  demo: number;
  consent_at: string | null;
  created_at: string;
};

app.get("/api/admin/users", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const like = `%${q}%`;

  const { results: profiles } = await c.env.DB.prepare(
    `SELECT id, role, name, email, status, demo, consent_at, created_at FROM profiles
     WHERE (? = '' OR lower(name) LIKE ? OR lower(email) LIKE ?)
     ORDER BY role, name`,
  )
    .bind(q, like, like)
    .all<AdminUserRow>();

  const { results: listings } = await c.env.DB.prepare(
    `SELECT l.id, l.landlord_id, l.title, l.rent, l.area, l.space_type, l.paused, l.leased,
            p.name AS landlord_name
     FROM listings l JOIN profiles p ON p.id = l.landlord_id
     WHERE (? = '' OR lower(l.title) LIKE ? OR lower(p.name) LIKE ?)
     ORDER BY l.paused, p.name`,
  )
    .bind(q, like, like)
    .all<{
      id: string;
      landlord_id: string;
      title: string;
      rent: number;
      area: string;
      space_type: string;
      paused: number;
      leased: number;
      landlord_name: string;
    }>();

  return c.json({
    users: (profiles ?? []).map((row) => ({
      id: row.id,
      role: row.role,
      name: row.name,
      email: row.email,
      status: row.status,
      demo: row.demo === 1,
      consentAt: row.consent_at,
      createdAt: row.created_at,
    })),
    listings: (listings ?? []).map((row) => ({
      id: row.id,
      landlordId: row.landlord_id,
      landlordName: row.landlord_name,
      title: row.title,
      rent: row.rent,
      area: row.area,
      spaceType: row.space_type,
      paused: row.paused === 1,
      leased: row.leased === 1,
    })),
  });
});

app.post("/api/admin/users/:id/view", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin only." }, 403);
  const id = c.req.param("id");
  const profile = await getProfileRow(c.env.DB, id);
  if (!profile) return c.json({ error: "Profile not found." }, 404);
  await logAdmin(c.env.DB, admin.id, "view_profile", id, profile.name);

  const listing = await getListingForLandlord(c.env.DB, id);
  return c.json({
    profile: mapProfile(profile),
    listing,
    trust: await getTrust(c.env.DB, id),
    consentAt: profile.consent_at,
    status: profile.status,
  });
});

app.post("/api/admin/users/:id/suspend", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin only." }, 403);
  const target = await getProfileRow(c.env.DB, c.req.param("id"));
  if (!target) return c.json({ error: "Profile not found." }, 404);
  if (target.role === "admin") return c.json({ error: "Admin accounts cannot be suspended." }, 400);
  const body = record(await c.req.json().catch(() => ({})));
  const suspended = body.suspended !== false;
  const status = suspended ? "suspended" : "active";
  await c.env.DB.prepare("UPDATE profiles SET status = ? WHERE id = ?")
    .bind(status, target.id)
    .run();
  if (suspended) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE profile_id = ?").bind(target.id).run();
  }
  await logAdmin(c.env.DB, admin.id, suspended ? "suspend_user" : "reinstate_user", target.id);
  return c.json({ ok: true, status });
});

app.post("/api/admin/listings/:id/state", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin only." }, 403);
  const listing = await getListing(c.env.DB, c.req.param("id"));
  if (!listing) return c.json({ error: "Listing not found." }, 404);
  const body = record(await c.req.json().catch(() => ({})));
  const paused = typeof body.paused === "boolean" ? body.paused : listing.paused;
  const leased = typeof body.leased === "boolean" ? body.leased : listing.leased;
  await c.env.DB.prepare("UPDATE listings SET paused = ?, leased = ? WHERE id = ?")
    .bind(paused ? 1 : 0, leased ? 1 : 0, listing.id)
    .run();
  await logAdmin(
    c.env.DB,
    admin.id,
    paused ? "pause_listing" : "resume_listing",
    listing.id,
    listing.title,
  );
  return c.json({ ok: true, paused, leased });
});

app.get("/api/admin/data-requests", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT d.*, p.name AS profile_name, p.email AS profile_email
     FROM data_requests d LEFT JOIN profiles p ON p.id = d.profile_id
     ORDER BY d.status, d.created_at DESC`,
  ).all<{
    id: string;
    profile_id: string;
    profile_name: string | null;
    profile_email: string | null;
    kind: string;
    note: string;
    status: string;
    created_at: string;
  }>();
  return c.json({
    requests: (results ?? []).map((row) => ({
      id: row.id,
      profileName: row.profile_name ?? "Deleted user",
      profileEmail: row.profile_email ?? "",
      kind: row.kind,
      note: row.note,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

app.post("/api/admin/data-requests/:id/resolve", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin only." }, 403);
  const result = await c.env.DB.prepare(
    "UPDATE data_requests SET status = 'handled', resolved_at = ? WHERE id = ?",
  )
    .bind(new Date().toISOString(), c.req.param("id"))
    .run();
  if (!result.meta.changes) return c.json({ error: "Request not found." }, 404);
  await logAdmin(c.env.DB, admin.id, "data_request_handled", c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/api/admin/audit", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, p.name AS admin_name FROM admin_audit a
     LEFT JOIN profiles p ON p.id = a.admin_id
     ORDER BY a.created_at DESC LIMIT 30`,
  ).all<{
    id: string;
    admin_name: string | null;
    action: string;
    target_id: string | null;
    detail: string;
    created_at: string;
  }>();
  return c.json({
    entries: (results ?? []).map((row) => ({
      id: row.id,
      adminName: row.admin_name ?? "Deservia",
      action: row.action,
      targetId: row.target_id,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  });
});

type AdminMatchRow = MatchDbRow & {
  tenant_name: string;
  landlord_name: string;
  listing_title: string | null;
};

function snapshotScore(row: MatchDbRow): ScoreResult | null {
  if (!row.score_snapshot) return null;
  try {
    return JSON.parse(row.score_snapshot) as ScoreResult;
  } catch {
    return null;
  }
}

async function adminMatchRows(db: D1Database, limit = 100): Promise<AdminMatchRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.*, t.name AS tenant_name, l.name AS landlord_name, li.title AS listing_title
       FROM matches m
       JOIN profiles t ON t.id = m.tenant_id
       JOIN profiles l ON l.id = m.landlord_id
       LEFT JOIN listings li ON li.landlord_id = m.landlord_id
       ORDER BY m.updated_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<AdminMatchRow>();
  return results ?? [];
}

async function matchSummary(db: D1Database, row: AdminMatchRow) {
  const snapshot = snapshotScore(row);
  let score = snapshot;
  if (!score) {
    const tenant = await getProfile(db, row.tenant_id);
    const landlord = await getProfile(db, row.landlord_id);
    const listing = await getListingForLandlord(db, row.landlord_id);
    if (tenant && landlord && listing) {
      score = scoreTenantLandlord(tenant, landlord, listing);
    }
  }
  return {
    id: row.id,
    tenantName: row.tenant_name,
    landlordName: row.landlord_name,
    listingTitle: row.listing_title ?? "Listing removed",
    percent: score?.score ?? 0,
    score,
    status: row.status,
    createdAt: row.created_at,
    snapshotAt: row.score_at,
  };
}

app.get("/api/admin/matches", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const rows = await adminMatchRows(c.env.DB);
  const matches = [];
  for (const row of rows) matches.push(await matchSummary(c.env.DB, row));
  return c.json({ matches });
});

const PROTECTED_WORDS = [
  "age",
  "family status",
  "marital",
  "children",
  "disability",
  "religion",
  "race",
  "ethnicity",
  "ancestry",
  "citizenship",
  "sexual",
  "gender",
  "assistance",
];

app.get("/api/admin/dashboard", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const db = c.env.DB;

  const roleRows = await db
    .prepare("SELECT role, COUNT(*) AS n FROM profiles WHERE status = 'active' GROUP BY role")
    .all<{ role: string; n: number }>();
  const counts = Object.fromEntries((roleRows.results ?? []).map((row) => [row.role, row.n]));

  const listingCounts = await db
    .prepare(
      "SELECT COUNT(*) AS n, SUM(paused) AS paused, SUM(leased) AS leased FROM listings",
    )
    .first<{ n: number; paused: number; leased: number }>();

  const actionCounts = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN tenant_action = 'like' THEN 1 ELSE 0 END) +
        SUM(CASE WHEN landlord_action = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN tenant_action = 'pass' THEN 1 ELSE 0 END) +
        SUM(CASE WHEN landlord_action = 'pass' THEN 1 ELSE 0 END) AS passes
       FROM matches`,
    )
    .first<{ likes: number; passes: number }>();

  const mutualRow = await db
    .prepare("SELECT COUNT(*) AS n FROM matches WHERE status IN ('mutual','accepted')")
    .first<{ n: number }>();

  const [tenants, landlords] = await Promise.all([listTenants(db), listLandlords(db)]);

  const buckets = [
    { label: "0–49", min: 0, max: 49, count: 0 },
    { label: "50–59", min: 50, max: 59, count: 0 },
    { label: "60–69", min: 60, max: 69, count: 0 },
    { label: "70–79", min: 70, max: 79, count: 0 },
    { label: "80–89", min: 80, max: 89, count: 0 },
    { label: "90–100", min: 90, max: 100, count: 0 },
  ];

  let pairs = 0;
  let checksRun = 0;
  let failures = 0;
  let meeting = 0;
  const noGreatFit: { id: string; name: string }[] = [];

  for (const tenant of tenants) {
    const scores: number[] = [];
    for (const { profile: landlord, listing } of landlords) {
      pairs += 1;
      const scored = scoreTenantLandlord(tenant, landlord, listing);
      const again = scoreTenantLandlord(tenant, landlord, listing);
      scores.push(scored.score);

      const bucket = buckets.find((entry) => scored.score >= entry.min && scored.score <= entry.max);
      if (bucket) bucket.count += 1;

      checksRun += 3;
      // The engine only ever sees questionnaire keys. Check the keys handed to
      // it, not free text, so a word like "storage" cannot look like "age".
      const scoredKeys = [
        ...Object.keys(tenant.lifestyle),
        ...Object.keys(tenant.home ?? {}),
        ...Object.keys(landlord.lifestyle),
        "spaceType",
        "area",
        "budget",
        "timing",
        "bedrooms",
        "washrooms",
        "parking",
        "furnished",
        "lease",
        "petsPolicy",
        "smokingPolicy",
      ].map((key) => key.toLowerCase());
      const leaks = PROTECTED_WORDS.filter((word) =>
        scoredKeys.some((key) => key.includes(word)),
      );
      if (leaks.length) failures += 1;
      if (scored.score !== again.score) failures += 1;
      if (scored.score < 0 || scored.score > 100) failures += 1;
    }

    const greatFits = scores
      .sort((a, b) => b - a)
      .slice(0, 10)
      .filter((score) => score >= 85).length;
    if (greatFits >= 1 && greatFits <= 3) meeting += 1;
    if (greatFits === 0) noGreatFit.push({ id: tenant.id, name: tenant.name });
  }

  const likes = actionCounts?.likes ?? 0;
  const mutual = mutualRow?.n ?? 0;
  const recentRows = (await adminMatchRows(db, 6)).filter(
    (row) => row.status === "mutual" || row.status === "accepted",
  );
  const recentMatches = [];
  for (const row of recentRows) recentMatches.push(await matchSummary(db, row));

  return c.json({
    stats: {
      tenants: counts.tenant ?? 0,
      landlords: counts.landlord ?? 0,
      admins: counts.admin ?? 0,
      activeListings:
        (listingCounts?.n ?? 0) - (listingCounts?.paused ?? 0) - (listingCounts?.leased ?? 0),
      pausedListings: listingCounts?.paused ?? 0,
      leasedListings: listingCounts?.leased ?? 0,
      likes,
      passes: actionCounts?.passes ?? 0,
      mutual,
      likeToMatchRate: likes ? Math.round((mutual / likes) * 1000) / 10 : 0,
      pairs,
    },
    distribution: buckets.map(({ label: bucketLabel, count }) => ({ label: bucketLabel, count })),
    goodFit: {
      target: "Each tenant should have 1–3 great fits (85%+) in their top 10",
      tenants: tenants.length,
      meeting,
      noGreatFit,
    },
    fairness: {
      checksRun,
      failures,
      checks: [
        "No protected ground appears in the inputs handed to the scorer",
        "Every score is deterministic when recalculated",
        "Every score stays inside 0–100",
        `Every criterion is one of the ${WEIGHTS.length} published weights`,
      ],
    },
    weights: WEIGHTS,
    notes: FAIRNESS_NOTES,
    recentMatches,
  });
});

app.get("/api/admin/fairness", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "Admin only." }, 403);
  const profiles = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM profiles").first<{
    n: number;
  }>();
  const ratings = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ratings").first<{
    n: number;
  }>();
  const openReports = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM reports WHERE status = 'open'",
  ).first<{ n: number }>();

  return c.json({
    ...FAIRNESS_NOTES,
    weights: WEIGHTS,
    stats: {
      profiles: profiles?.n ?? 0,
      ratings: ratings?.n ?? 0,
      openReports: openReports?.n ?? 0,
    },
  });
});

/* -------------------------------------------------------- notifications */

async function notify(
  db: D1Database,
  profileId: string,
  kind: string,
  body: string,
  link: string | null,
) {
  await db
    .prepare(
      `INSERT INTO notifications (id, profile_id, kind, body, link, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      profileId,
      kind,
      body.slice(0, 400),
      link,
      new Date().toISOString(),
    )
    .run();
}

type NotificationRow = {
  id: string;
  kind: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

app.get("/api/notifications", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM notifications WHERE profile_id = ? ORDER BY created_at DESC LIMIT 20",
  )
    .bind(me.id)
    .all<NotificationRow>();
  const items: AppNotification[] = (results ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
  return c.json({ items, unread: items.filter((item) => !item.readAt).length });
});

app.post("/api/notifications/read", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const now = new Date().toISOString();
  if (typeof body.id === "string") {
    await c.env.DB.prepare(
      "UPDATE notifications SET read_at = ? WHERE id = ? AND profile_id = ?",
    )
      .bind(now, body.id, me.id)
      .run();
  } else {
    await c.env.DB.prepare(
      "UPDATE notifications SET read_at = ? WHERE profile_id = ? AND read_at IS NULL",
    )
      .bind(now, me.id)
      .run();
  }
  return c.json({ ok: true });
});

/* ------------------------------------------------------- liked listings */

app.get("/api/liked", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  if (me.role !== "tenant") {
    return c.json({ error: "Liked listings are for tenant accounts." }, 403);
  }
  // One entry per liked listing: a tenant can like several homes from the same
  // landlord, so listing_likes is the source of truth here.
  const seen = new Set<string>();
  const picks: { listingId: string; landlordId: string }[] = [];

  const { results: likeRows } = await c.env.DB.prepare(
    "SELECT listing_id, landlord_id FROM listing_likes WHERE tenant_id = ? ORDER BY created_at DESC",
  )
    .bind(me.id)
    .all<{ listing_id: string; landlord_id: string }>();
  for (const row of likeRows ?? []) {
    if (seen.has(row.listing_id)) continue;
    seen.add(row.listing_id);
    picks.push({ listingId: row.listing_id, landlordId: row.landlord_id });
  }

  // Likes recorded before listing_likes existed kept one listing per landlord.
  // Only landlords with no listing_likes row at all use this fallback.
  const covered = new Set(picks.map((pick) => pick.landlordId));
  const { results: legacy } = await c.env.DB.prepare(
    `SELECT * FROM matches
     WHERE tenant_id = ? AND tenant_action = 'like' AND status != 'withdrawn'`,
  )
    .bind(me.id)
    .all<MatchDbRow>();
  for (const row of legacy ?? []) {
    if (covered.has(row.landlord_id)) continue;
    const listing = await getListingForLandlord(c.env.DB, row.landlord_id);
    if (!listing || seen.has(listing.id)) continue;
    seen.add(listing.id);
    covered.add(row.landlord_id);
    picks.push({ listingId: listing.id, landlordId: row.landlord_id });
  }

  const items: Recommendation[] = [];
  for (const pick of picks) {
    const landlord = await getProfile(c.env.DB, pick.landlordId);
    const listing = await getListing(c.env.DB, pick.listingId);
    if (!landlord || !listing) continue;
    const row = await matchForPair(c.env.DB, me.id, pick.landlordId);
    items.push({
      other: publicProfile(
        landlord,
        row?.status === "mutual" || row?.status === "accepted",
      ),
      listing,
      score: scoreTenantLandlord(me, landlord, listing),
      match: {
        id: row?.id ?? listing.id,
        myAction: "like",
        theirAction: (row?.landlord_action ?? "pending") as Action,
        status: (row?.status ?? "requested") as MatchView["status"],
      },
    });
  }
  items.sort((a, b) => b.score.score - a.score.score);
  return c.json({ items });
});

/* ------------------------------------------------------ assistant history */

type ChatMessageRow = {
  id: string;
  profile_id: string;
  role: string;
  title: string | null;
  body: string | null;
  attachment: string | null;
  listing_id: string | null;
  created_at: string;
};

function chatMessageView(row: ChatMessageRow) {
  return {
    id: row.id,
    from: row.role === "me" ? "me" : "bot",
    title: row.title,
    text: row.body,
    attachment: row.attachment,
    listingId: row.listing_id,
    createdAt: row.created_at,
  };
}

app.get("/api/chat", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM chat_messages WHERE profile_id = ? ORDER BY created_at, rowid",
  )
    .bind(me.id)
    .all<ChatMessageRow>();
  return c.json({ messages: (results ?? []).map(chatMessageView) });
});

app.post("/api/chat", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const body = record(await c.req.json().catch(() => ({})));
  const from = body.from === "me" ? "me" : "bot";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  const attachment =
    typeof body.attachment === "string" && body.attachment.trim()
      ? body.attachment.trim().slice(0, 300)
      : null;
  const listingId =
    typeof body.listingId === "string" && body.listingId ? body.listingId : null;
  if (!text && !title) {
    return c.json({ error: "A message needs some text." }, 400);
  }
  if (listingId) {
    const listing = await c.env.DB.prepare("SELECT id FROM listings WHERE id = ?")
      .bind(listingId)
      .first<{ id: string }>();
    if (!listing) return c.json({ error: "Listing not found." }, 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO chat_messages
     (id, profile_id, role, title, body, attachment, listing_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, me.id, from, title, text, attachment, listingId, now)
    .run();
  return c.json(
    {
      message: chatMessageView({
        id,
        profile_id: me.id,
        role: from,
        title,
        body: text,
        attachment,
        listing_id: listingId,
        created_at: now,
      }),
    },
    201,
  );
});

/* ---------------------------------------------------------- chat context */

app.get("/api/listings/:id/chat", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  if (me.role !== "tenant") {
    return c.json({ error: "Attach listings from a tenant account." }, 403);
  }
  const listing = await getListing(c.env.DB, c.req.param("id"));
  if (!listing) return c.json({ error: "Listing not found." }, 404);
  if (listing.landlordId === me.id) {
    return c.json({ error: "That is your own listing." }, 403);
  }
  const row = await matchForPair(c.env.DB, me.id, listing.landlordId);
  if (!row || row.tenant_action !== "like" || row.status === "withdrawn") {
    return c.json({ error: "Attach a listing you liked first." }, 403);
  }
  const landlord = await getProfile(c.env.DB, listing.landlordId);
  const score = landlord ? scoreTenantLandlord(me, landlord, listing) : null;
  const houseRules = [
    listing.petsDetail ? `Pets: ${listing.petsDetail}` : null,
    listing.smokingDetail ? `Smoking: ${listing.smokingDetail}` : null,
    listing.entrance ? `Entrance: ${listing.entrance}` : null,
    listing.kitchen ? `Kitchen: ${listing.kitchen}` : null,
    listing.outdoor ? `Outdoor space: ${listing.outdoor}` : null,
    (listing.utilities ?? []).length
      ? `Included in rent: ${(listing.utilities ?? []).join(", ")}`
      : null,
  ].filter((item): item is string => Boolean(item));

  const chatAddress = listing.address
    ? `${listing.address}${listing.unit ? `, ${listing.unit}` : ""}, ${listing.area}${
        listing.postalCode ? ` ${listing.postalCode}` : ""
      }`
    : null;
  const tenantCenter = me.home?.center ?? null;
  const awayFromTenant =
    tenantCenter && typeof listing.lat === "number" && typeof listing.lng === "number"
      ? distanceKm(tenantCenter, { lat: listing.lat, lng: listing.lng })
      : null;

  const payload: ChatListing = {
    id: listing.id,
    title: listing.title,
    area: listing.area,
    address: chatAddress,
    distanceKm: awayFromTenant,
    rent: listing.rent,
    deposit: listing.deposit ?? null,
    availableFrom: listing.availableFrom ?? null,
    available: listing.available,
    lease: listing.lease,
    spaceType: listing.spaceType,
    bedrooms: listing.bedrooms,
    washrooms: listing.washrooms,
    washroomsDetail: listing.washroomsDetail ?? null,
    sizeSqft: listing.sizeSqft ?? null,
    furnished: listing.furnished,
    floorLevel: listing.floorLevel ?? null,
    heatingCooling: listing.heatingCooling ?? null,
    entrance: listing.entrance ?? null,
    kitchen: listing.kitchen ?? null,
    outdoor: listing.outdoor ?? null,
    petsPolicy: listing.petsPolicy,
    petsDetail: listing.petsDetail ?? null,
    smokingPolicy: listing.smokingPolicy,
    smokingDetail: listing.smokingDetail ?? null,
    parking: listing.parking,
    parkingDetail: listing.parkingDetail ?? null,
    laundry: listing.laundry ?? null,
    utilities: listing.utilities ?? [],
    amenities: listing.amenities,
    description: listing.blurb,
    photos: listing.photos ?? [],
    houseRules,
    landlordName: landlord?.name ?? "the landlord",
    match: score
      ? {
          score: score.score,
          criteria: score.criteria,
          commonalities: score.commonalities,
        }
      : null,
  };
  return c.json(payload);
});

/* ---------------------------------------------------- application (PDF) */

app.get("/api/matches/:id/application.pdf", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id) {
    return c.json({ error: "The application belongs to the tenant." }, 403);
  }
  if (row.status !== "mutual" && row.status !== "accepted") {
    return c.json({ error: "The rental application opens after a mutual match." }, 403);
  }

  // The supplied PDF, unchanged. Nothing here builds or reflows a form: the
  // endpoint serves the embedded bytes and their recorded checksum.
  const bytes = applicationPdfBytes();
  if (!bytes) {
    return c.json(
      {
        error:
          "The supplied rental application PDF is not in the project yet. Add private/RENTAL_APPLICATION_FORM.pdf and run npm run embed:application.",
        missingApplicationFile: true,
      },
      503,
    );
  }

  if (!row.application_sent_at) {
    await c.env.DB.prepare(
      "UPDATE matches SET application_sent_at = ? WHERE id = ? AND application_sent_at IS NULL",
    )
      .bind(new Date().toISOString(), row.id)
      .run();
  }

  const download = c.req.query("download") === "1";

  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${APPLICATION_FILE_NAME}"`,
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "no-store",
    ETag: `"${APPLICATION_SHA256}"`,
    "X-Content-SHA256": APPLICATION_SHA256,
  });
});

/* ------------------------------------------------------------ viewings */

const SLOT_WINDOW_DAYS = 60;

type ViewingRow = {
  id: string;
  match_id: string;
  start_utc: string;
  status: string;
  proposed_by: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapViewing(row: ViewingRow): Viewing {
  return {
    id: row.id,
    matchId: row.match_id,
    startUtc: row.start_utc,
    status: row.status as Viewing["status"],
    proposedBy: row.proposed_by,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  };
}

function validSlot(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() < Date.now() - 60_000) return null;
  if (date.getTime() > Date.now() + SLOT_WINDOW_DAYS * 86_400_000) return null;
  return date.toISOString();
}

async function activeViewing(db: D1Database, matchId: string): Promise<Viewing | null> {
  const row = await db
    .prepare(
      "SELECT * FROM viewings WHERE match_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .bind(matchId)
    .first<ViewingRow>();
  return row ? mapViewing(row) : null;
}

async function availabilityFor(
  db: D1Database,
  matchId: string,
  profileId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT start_utc FROM viewing_slots WHERE match_id = ? AND profile_id = ?")
    .bind(matchId, profileId)
    .all<{ start_utc: string }>();
  return (results ?? []).map((row) => row.start_utc).sort();
}

async function landlordConfirmedSlots(
  db: D1Database,
  landlordId: string,
  excludeMatchId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT v.start_utc FROM viewings v
       JOIN matches m ON m.id = v.match_id
       WHERE m.landlord_id = ? AND v.status IN ('proposed','confirmed','rescheduled')
         AND v.match_id != ?`,
    )
    .bind(landlordId, excludeMatchId)
    .all<{ start_utc: string }>();
  return (results ?? []).map((row) => row.start_utc);
}

app.get("/api/matches/:id/viewing", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status !== "mutual" && row.status !== "accepted") {
    return c.json({ error: "Scheduling opens on a mutual match." }, 400);
  }

  const iAmTenant = row.tenant_id === me.id;
  const otherId = iAmTenant ? row.landlord_id : row.tenant_id;
  const other = await getProfile(c.env.DB, otherId);
  const listing = await getListingForLandlord(c.env.DB, row.landlord_id);
  const mine = await availabilityFor(c.env.DB, row.id, me.id);
  const theirs = await availabilityFor(c.env.DB, row.id, otherId);
  const landlordAvailability = await availabilityFor(c.env.DB, row.id, row.landlord_id);
  const busyForLandlord = await landlordConfirmedSlots(c.env.DB, row.landlord_id, row.id);
  const taken = new Set(busyForLandlord);
  // The landlord's open ranges. A booked range is not offered to anyone else.
  const overlap = landlordAvailability.filter((slot) => !taken.has(slot));

  const listingAddress = listing?.address
    ? `${listing.address}${listing.unit ? `, ${listing.unit}` : ""}, ${listing.area}${
        listing.postalCode ? ` ${listing.postalCode}` : ""
      }`
    : listing?.area ?? "";

  const state: ViewingState = {
    viewing: await activeViewing(c.env.DB, row.id),
    mine,
    theirs: landlordAvailability,
    overlap,
    busyForLandlord,
    availability: landlordAvailability,
    iAmTenant,
    myId: me.id,
    otherName: other?.name ?? "the other person",
    listingTitle: listing?.title ?? "this home",
    listingArea: listing?.area ?? "",
    listingAddress,
  };
  return c.json(state);
});

app.post("/api/matches/:id/viewing/availability", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status !== "mutual" && row.status !== "accepted") {
    return c.json({ error: "Scheduling opens on a mutual match." }, 400);
  }
  if (me.role !== "landlord") {
    return c.json({ error: "The landlord sets the viewing availability." }, 403);
  }
  const body = record(await c.req.json().catch(() => ({})));
  if (!Array.isArray(body.slots)) {
    return c.json({ error: "Send a list of time slots." }, 400);
  }
  const slots = [
    ...new Set(
      body.slots
        .map(validSlot)
        .filter((slot): slot is string => Boolean(slot)),
    ),
  ].slice(0, 140);

  const now = new Date().toISOString();
  const statements = [
    c.env.DB.prepare("DELETE FROM viewing_slots WHERE match_id = ? AND profile_id = ?").bind(
      row.id,
      me.id,
    ),
    ...slots.map((slot) =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO viewing_slots (id, match_id, profile_id, start_utc, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), row.id, me.id, slot, now),
    ),
  ];
  await c.env.DB.batch(statements);
  return c.json({ ok: true, slots });
});

app.post("/api/matches/:id/viewing/propose", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status !== "mutual" && row.status !== "accepted") {
    return c.json({ error: "Scheduling opens on a mutual match." }, 400);
  }
  const body = record(await c.req.json().catch(() => ({})));
  const start = validSlot(body.at);
  if (!start) return c.json({ error: "Pick a valid viewing date and time." }, 400);

  const otherId = row.tenant_id === me.id ? row.landlord_id : row.tenant_id;
  const landlordOpen = await availabilityFor(c.env.DB, row.id, row.landlord_id);
  if (!landlordOpen.includes(start)) {
    return c.json({ error: "Pick one of the landlord's open viewing times." }, 400);
  }
  const landlordId = row.landlord_id;
  const busy = await landlordConfirmedSlots(c.env.DB, landlordId, row.id);
  if (busy.includes(start)) {
    return c.json({ error: "The landlord already has a viewing at that time." }, 409);
  }

  const now = new Date().toISOString();
  const current = await activeViewing(c.env.DB, row.id);
  const statements = [];
  if (current && (current.status === "proposed" || current.status === "rescheduled")) {
    statements.push(
      c.env.DB.prepare("UPDATE viewings SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(
        now,
        current.id,
      ),
    );
  }
  if (current && current.status === "confirmed") {
    statements.push(
      c.env.DB.prepare(
        "UPDATE viewings SET status = 'rescheduled', updated_at = ? WHERE id = ?",
      ).bind(now, current.id),
    );
  }
  const id = crypto.randomUUID();
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO viewings (id, match_id, start_utc, status, proposed_by, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'proposed', ?, NULL, ?, ?)`,
    ).bind(id, row.id, start, me.id, now, now),
    c.env.DB.prepare("UPDATE matches SET viewing_at = NULL, updated_at = ? WHERE id = ?").bind(
      now,
      row.id,
    ),
  );
  await c.env.DB.batch(statements);

  const when = new Date(start).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  await notify(
    c.env.DB,
    otherId,
    "viewing_proposed",
    `${me.name} proposed a viewing for ${when} (UTC). Confirm it or suggest another time.`,
    "/app/matches",
  );
  return c.json({ ok: true, viewing: await activeViewing(c.env.DB, row.id) });
});

app.post("/api/matches/:id/viewing/confirm", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  if (row.status !== "mutual" && row.status !== "accepted") {
    return c.json({ error: "Scheduling opens on a mutual match." }, 400);
  }
  const current = await activeViewing(c.env.DB, row.id);
  if (!current || (current.status !== "proposed" && current.status !== "rescheduled")) {
    return c.json({ error: "There is no proposed viewing to confirm." }, 400);
  }
  if (current.proposedBy === me.id) {
    return c.json({ error: "The other side confirms this proposal." }, 400);
  }
  const landlordOpen = await availabilityFor(c.env.DB, row.id, row.landlord_id);
  if (!landlordOpen.includes(current.startUtc)) {
    return c.json({ error: "That time is no longer open. Propose another." }, 409);
  }
  const busy = await landlordConfirmedSlots(c.env.DB, row.landlord_id, row.id);
  if (busy.includes(current.startUtc)) {
    return c.json({ error: "The landlord already has a viewing at that time." }, 409);
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE viewings SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?",
    ).bind(now, now, current.id),
    c.env.DB.prepare("UPDATE matches SET viewing_at = ?, updated_at = ? WHERE id = ?").bind(
      current.startUtc,
      now,
      row.id,
    ),
  ]);
  const when = new Date(current.startUtc).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  await notify(
    c.env.DB,
    current.proposedBy,
    "viewing_confirmed",
    `${me.name} confirmed the viewing for ${when} (UTC).`,
    "/app/matches",
  );
  return c.json({ ok: true, viewing: await activeViewing(c.env.DB, row.id) });
});

app.post("/api/matches/:id/viewing/cancel", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  const current = await activeViewing(c.env.DB, row.id);
  if (!current || current.status === "cancelled" || current.status === "completed") {
    return c.json({ error: "There is no viewing to cancel." }, 400);
  }
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE viewings SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(
      now,
      current.id,
    ),
    c.env.DB.prepare("UPDATE matches SET viewing_at = NULL, updated_at = ? WHERE id = ?").bind(
      now,
      row.id,
    ),
  ]);
  const otherId = row.tenant_id === me.id ? row.landlord_id : row.tenant_id;
  await notify(
    c.env.DB,
    otherId,
    "viewing_cancelled",
    `${me.name} cancelled the viewing. You can propose a new time.`,
    "/app/matches",
  );
  return c.json({ ok: true });
});

app.post("/api/matches/:id/viewing/complete", async (c) => {
  const me = c.get("me");
  if (!me) return unauthorised();
  const row = await findMatch(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "Match not found." }, 404);
  if (row.tenant_id !== me.id && row.landlord_id !== me.id) {
    return c.json({ error: "Not your match." }, 403);
  }
  const current = await activeViewing(c.env.DB, row.id);
  if (!current || current.status !== "confirmed") {
    return c.json({ error: "Only a confirmed viewing can be completed." }, 400);
  }
  await c.env.DB.prepare(
    "UPDATE viewings SET status = 'completed', updated_at = ? WHERE id = ?",
  )
    .bind(new Date().toISOString(), current.id)
    .run();
  const otherId = row.tenant_id === me.id ? row.landlord_id : row.tenant_id;
  await notify(
    c.env.DB,
    otherId,
    "viewing_completed",
    `${me.name} marked the viewing as completed.`,
    "/app/matches",
  );
  return c.json({ ok: true, viewing: await activeViewing(c.env.DB, row.id) });
});

/* ------------------------------------------------------------------ assets */

app.route("/api/chatbot", chatbot);

app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

app.onError((error, c) => {
  console.error("api_error", error);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

/** Everything that is not an API route is served from the built SPA. */
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
