/**
 * Deservia matching engine.
 *
 * Inputs are strictly limited to:
 *   - the lifestyle questionnaire (how each side lives)
 *   - the home preferences / listing facts
 *
 * `Profile` is accepted only so the function can read `lifestyle` and `home`.
 * Name, avatar, email, id, role and age are never read here. Protected grounds
 * (family status, disability, religion, race, place of origin, age, receipt of
 * public assistance, etc.) have no field in the questionnaire at all, so they
 * cannot enter a score directly or through a stand-in.
 */
import type {
  Criterion,
  Home,
  Lifestyle,
  Listing,
  Profile,
  ScoreResult,
} from "../shared/types";
import { budgetLabel, distanceKm, label } from "../shared/types";

export const SCORE_VERSION = "deservia-score-1.0";

export type WeightRow = {
  key: string;
  label: string;
  weight: number;
  kind: "lifestyle" | "home";
};

/** Published weights — shown to users and to Deservia's admin. */
export const WEIGHTS: WeightRow[] = [
  { key: "tidiness", label: "Tidiness", weight: 12, kind: "lifestyle" },
  { key: "smoking", label: "Smoking", weight: 12, kind: "lifestyle" },
  { key: "pets", label: "Pets", weight: 10, kind: "lifestyle" },
  { key: "music", label: "Music & noise", weight: 8, kind: "lifestyle" },
  { key: "schedule", label: "Daily schedule", weight: 8, kind: "lifestyle" },
  { key: "hobbies", label: "Shared hobbies", weight: 8, kind: "lifestyle" },
  { key: "chronotype", label: "Early bird / night owl", weight: 7, kind: "lifestyle" },
  { key: "social", label: "Introvert / extrovert", weight: 6, kind: "lifestyle" },
  { key: "kitchen", label: "Shared kitchen", weight: 5, kind: "lifestyle" },
  { key: "issueSpeed", label: "Repairs turnaround", weight: 4, kind: "lifestyle" },
  { key: "smells", label: "Cooking smells", weight: 3, kind: "lifestyle" },
  { key: "budget", label: "Budget / rent", weight: 8, kind: "home" },
  { key: "area", label: "Area", weight: 6, kind: "home" },
  { key: "location", label: "Distance from you", weight: 10, kind: "home" },
  { key: "spaceType", label: "Type of space", weight: 3, kind: "home" },
  { key: "bedrooms", label: "Bedrooms", weight: 2, kind: "home" },
  { key: "lease", label: "Lease length", weight: 2, kind: "home" },
  { key: "washrooms", label: "Washrooms", weight: 1, kind: "home" },
  { key: "parking", label: "Parking", weight: 1, kind: "home" },
  { key: "furnished", label: "Furnished", weight: 1, kind: "home" },
];

const DEFAULT_HOME: Home = {
  spaceType: "apartment",
  area: "",
  budget: 0,
  timing: "flexible",
  bedrooms: 1,
  washrooms: 1,
  parking: "none",
  furnished: "either",
  lease: "flexible",
  issueSpeed: "no_pref",
  concern: "rules",
};

const TOLERANT = new Set([
  "no_preference",
  "unspecified",
  "flexible",
  "either",
  "no_pref",
  "mix",
]);

/** Returns 1 for equal answers, partial credit for compatible ones. */
function graded(a: string, b: string, pairs: Record<string, number>): number {
  if (a === b) return 1;
  if (TOLERANT.has(a) || TOLERANT.has(b)) return 0.8;
  const key = [a, b].sort().join("|");
  return pairs[key] ?? 0.2;
}

function petSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a === "no_preference" || b === "no_preference") return 0.75;
  if (a === "loves_pets" || b === "loves_pets") {
    return a === "no_pets" || b === "no_pets" || a === "none" || b === "none" ? 0.45 : 0.85;
  }
  const hasPet = (v: string) => v === "dog" || v === "cat" || v === "other" || v === "have_pet";
  const noPet = (v: string) => v === "none" || v === "no_pets" || v === "loves_none";
  if (hasPet(a) && hasPet(b)) return a === b ? 1 : 0.55;
  if (hasPet(a) && noPet(b)) return b === "none" || b === "no_pets" ? 0.15 : 0.45;
  if (hasPet(b) && noPet(a)) return a === "none" || a === "no_pets" ? 0.15 : 0.45;
  return 0.95;
}

function smokingSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a === "no_preference" || b === "no_preference") return 0.7;
  const set = new Set([a, b]);
  if (set.has("non") && set.has("outside")) return 0.55;
  if (set.has("non") && set.has("smoker")) return 0.03;
  return 0.45;
}

function budgetSim(maxBudget: number, rent: number): number {
  if (!maxBudget || !rent) return 0.2;
  if (maxBudget >= rent) return 1;
  const ratio = maxBudget / rent;
  if (ratio >= 0.9) return 0.75;
  if (ratio >= 0.8) return 0.45;
  return 0.1;
}

const REGIONS: Record<string, string> = {
  Brampton: "Peel",
  Mississauga: "Peel",
  Caledon: "Peel",
  Toronto: "Toronto",
  Scarborough: "Toronto",
  "North York": "Toronto",
  Etobicoke: "Toronto",
  Vaughan: "York",
  Markham: "York",
  Hamilton: "Hamilton",
  Oshawa: "Durham",
};

function areaSim(tenantArea: string, listingArea: string): number {
  if (!tenantArea || !listingArea) return 0.5;
  if (tenantArea === listingArea) return 1;
  if (REGIONS[tenantArea] && REGIONS[tenantArea] === REGIONS[listingArea]) return 0.55;
  return 0.3;
}

function spaceSim(a: string, b: string): number {
  if (a === b) return 1;
  const key = [a, b].sort().join("|");
  const map: Record<string, number> = {
    "apartment|basement": 0.6,
    "apartment|upper": 0.6,
    "basement|upper": 0.5,
    "house|upper": 0.55,
    "house|basement": 0.45,
    "apartment|room": 0.35,
    "basement|room": 0.3,
    "house|apartment": 0.4,
    "rent_to_own|house": 0.6,
  };
  return map[key] ?? 0.2;
}

function furnishedSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a === "either" || b === "either") return 0.85;
  const key = [a, b].sort().join("|");
  const map: Record<string, number> = {
    "partly|furnished": 0.6,
    "partly|unfurnished": 0.65,
    "furnished|unfurnished": 0.15,
  };
  return map[key] ?? 0.3;
}

function leaseSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a === "flexible" || b === "flexible") return 0.85;
  const key = [a, b].sort().join("|");
  const map: Record<string, number> = {
    "6mo|1yr": 0.7,
    "1yr|2yr": 0.8,
    "month|6mo": 0.6,
    "month|1yr": 0.45,
    "month|2yr": 0.3,
  };
  return map[key] ?? 0.4;
}

function bedroomsSim(wanted: number, offered: number): number {
  if (wanted === offered) return 1;
  if (offered > wanted) return 0.8;
  return 0.25;
}

function washroomsSim(wanted: number, offered: number): number {
  if (wanted === offered) return 1;
  if (offered > wanted) return 0.85;
  return 0.45;
}

function parkingSim(wanted: string, offered: string): number {
  if (wanted === "required") return offered === "none" ? 0.1 : 1;
  if (wanted === "nice") return offered === "none" ? 0.75 : 1;
  return 1;
}

function hobbySim(a: string[], b: string[]): number {
  const mine = new Set(a ?? []);
  const theirs = new Set(b ?? []);
  if (!mine.size || !theirs.size) return 0.5;
  let shared = 0;
  for (const hobby of mine) if (theirs.has(hobby)) shared += 1;
  const union = new Set([...mine, ...theirs]).size;
  return shared / union;
}

function petCommonality(value: string): string {
  if (value === "dog") return "Both have a dog";
  if (value === "cat") return "Both have a cat";
  if (value === "other") return "Both have a pet";
  if (value === "none") return "Both have no pets";
  if (value === "loves_none") return "Both love pets, none right now";
  return "Same pet preference";
}

export function homeFromListing(listing: Listing, landlord: Profile): Home {
  return {
    spaceType: listing.spaceType,
    area: listing.area,
    budget: listing.rent,
    timing: listing.available,
    bedrooms: listing.bedrooms,
    washrooms: listing.washrooms,
    parking: listing.parking,
    furnished: listing.furnished,
    lease: listing.lease,
    issueSpeed: landlord.lifestyle.issueSpeed || "no_pref",
    concern: "rules",
  };
}

/** The unit's house rules override the landlord's own habits. */
export function lifestyleFromListing(landlord: Profile, listing: Listing): Lifestyle {
  return {
    ...landlord.lifestyle,
    pets: listing.petsPolicy,
    smoking: listing.smokingPolicy,
  };
}

const HOBBY_WORDS: Record<string, string> = {
  gardening: "gardening",
  fishing: "fishing",
  painting: "painting",
  creative: "creative projects",
  tech: "building websites and tech",
  music: "music",
  travel: "travel",
  cooking: "cooking",
  fitness: "fitness",
  reading: "reading",
  gym: "the gym",
  yoga: "yoga",
  plants: "plants",
  gaming: "gaming",
  art: "art",
  movies: "movies",
  dancing: "dancing",
  sports: "sports",
};

function tidyWord(value: string): string {
  if (value === "very") return "very tidy";
  if (value === "relaxed") return "relaxed";
  return "reasonably tidy";
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`;
}

/**
 * Score one tenant against one landlord's listing.
 * Symmetric: swapping sides does not change the percentage.
 */
export function scoreTenantLandlord(
  tenant: Profile,
  landlord: Profile,
  listing: Listing,
): ScoreResult {
  const t: Lifestyle = tenant.lifestyle;
  const l: Lifestyle = lifestyleFromListing(landlord, listing);
  const th: Home = tenant.home ?? DEFAULT_HOME;
  const lh: Home = homeFromListing(listing, landlord);

  const criteria: Criterion[] = [];
  const commonalities: string[] = [];
  const watchouts: string[] = [];

  const add = (
    key: string,
    name: string,
    score: number,
    note: string,
    common?: string,
    watch?: string,
  ) => {
    const weight = WEIGHTS.find((w) => w.key === key)?.weight ?? 1;
    criteria.push({
      key,
      label: name,
      weight,
      score: Math.round(score * 100) / 100,
      note,
    });
    if (common && score >= 0.95) commonalities.push(common);
    if (watch && score <= 0.45) watchouts.push(watch);
  };

  add(
    "tidiness",
    "Tidiness",
    graded(t.tidiness, l.tidiness, {
      "reasonable|very": 0.6,
      "reasonable|relaxed": 0.6,
      "relaxed|very": 0.15,
    }),
    `${label("tidiness", t.tidiness)} · ${label("tidiness", l.tidiness)}`,
    `Both keep a ${tidyWord(t.tidiness)} home`,
    `Tidiness differs: ${tidyWord(t.tidiness)} vs ${tidyWord(l.tidiness)}`,
  );

  add(
    "smoking",
    "Smoking",
    smokingSim(t.smoking, l.smoking),
    `${label("smoking", t.smoking)} · ${label("smoking", l.smoking)}`,
    t.smoking === "non" && l.smoking === "non" ? "Both non-smokers" : undefined,
    "Smoking expectations don't line up",
  );

  add(
    "pets",
    "Pets",
    petSim(t.pets, l.pets),
    `${label("pets", t.pets)} · ${label("pets", l.pets)}`,
    t.pets === l.pets ? petCommonality(t.pets) : undefined,
    "Pet situation is a mismatch",
  );

  add(
    "music",
    "Music & noise",
    graded(t.music, l.music, {
      "quiet|some_noise": 0.55,
      "loves|some_noise": 0.6,
      "loves|quiet": 0.15,
    }),
    `${label("music", t.music)} · ${label("music", l.music)}`,
    t.music === l.music ? `Both want the same sound level — ${label("music", t.music).toLowerCase()}` : undefined,
    "Noise expectations differ",
  );

  add(
    "schedule",
    "Daily schedule",
    graded(t.schedule, l.schedule, {
      "home_day|out_day": 0.5,
      "out_day|shifts": 0.6,
      "home_day|shifts": 0.6,
    }),
    `${label("schedule", t.schedule)} · ${label("schedule", l.schedule)}`,
    t.schedule === l.schedule ? `Both ${label("schedule", t.schedule).toLowerCase()}` : undefined,
  );

  const sharedHobbies = (t.hobbies ?? []).filter((h) => (l.hobbies ?? []).includes(h));
  add(
    "hobbies",
    "Shared hobbies",
    hobbySim(t.hobbies, l.hobbies),
    sharedHobbies.length
      ? sharedHobbies.map((h) => HOBBY_WORDS[h] ?? h).join(", ")
      : "No overlapping hobbies yet",
    sharedHobbies.length
      ? `Both into ${listWords(sharedHobbies.map((h) => HOBBY_WORDS[h] ?? h))}`
      : undefined,
  );

  add(
    "chronotype",
    "Early bird / night owl",
    graded(t.chronotype, l.chronotype, {
      "between|early": 0.65,
      "between|night": 0.65,
      "early|night": 0.25,
    }),
    `${label("chronotype", t.chronotype)} · ${label("chronotype", l.chronotype)}`,
    t.chronotype === l.chronotype
      ? `Both ${t.chronotype === "early" ? "early birds" : t.chronotype === "night" ? "night owls" : "somewhere in between"}`
      : undefined,
    "Sleep schedules are quite different",
  );

  add(
    "social",
    "Introvert / extrovert",
    graded(t.social, l.social, {
      "introvert|mix": 0.65,
      "extrovert|mix": 0.65,
      "extrovert|introvert": 0.35,
    }),
    `${label("social", t.social)} · ${label("social", l.social)}`,
    t.social === l.social ? `Both ${label("social", t.social).toLowerCase()}` : undefined,
  );

  add(
    "kitchen",
    "Shared kitchen",
    graded(t.kitchenUse, l.kitchenUse, {
      "daily|few": 0.6,
      "few|rarely": 0.6,
      "daily|rarely": 0.3,
    }),
    `${label("kitchenUse", t.kitchenUse)} · ${label("kitchenUse", l.kitchenUse)}`,
    t.kitchenUse === l.kitchenUse ? `Same kitchen rhythm — ${label("kitchenUse", t.kitchenUse).toLowerCase()}` : undefined,
  );

  add(
    "smells",
    "Cooking smells",
    graded(t.smells, l.smells, {
      "light|strong": 0.4,
      "light|rarely_cook": 0.7,
      "rarely_cook|strong": 0.5,
    }),
    `${label("smells", t.smells)} · ${label("smells", l.smells)}`,
  );

  const tenantSpeed = th.issueSpeed || "no_pref";
  const landlordSpeed = l.issueSpeed || lh.issueSpeed || "no_pref";
  add(
    "issueSpeed",
    "Repairs turnaround",
    graded(tenantSpeed, landlordSpeed, {
      "24h|same_day": 0.75,
      "24h|week": 0.5,
      "same_day|week": 0.3,
    }),
    `${label("issueSpeed", tenantSpeed)} · ${label("issueSpeed", landlordSpeed)}`,
    tenantSpeed === landlordSpeed
      ? `Both expect repairs ${label("issueSpeed", tenantSpeed).toLowerCase()}`
      : undefined,
    "Different expectations on how fast repairs happen",
  );

  const rent = lh.budget;
  const maxBudget = th.budget;
  const affordable = maxBudget >= rent;
  add(
    "budget",
    "Budget / rent",
    budgetSim(maxBudget, rent),
    `${budgetLabel(rent)} rent · ${budgetLabel(maxBudget)} budget`,
    affordable && rent <= maxBudget * 0.85 ? "Rent leaves room in the budget" : undefined,
    `Rent is ${budgetLabel(rent)} against a ${budgetLabel(maxBudget)} budget`,
  );

  add(
    "area",
    "Area",
    areaSim(th.area, lh.area),
    th.area === lh.area ? `${th.area}` : `${th.area || "Any area"} · ${lh.area}`,
    th.area === lh.area ? `Same area — ${th.area}` : undefined,
    `Different areas — ${th.area || "any"} vs ${lh.area}`,
  );

  // Straight-line distance from the tenant's address to the listing. Closer
  // listings score higher; listings outside the radius earn very little.
  const origin = th.center ?? null;
  const destination =
    typeof listing.lat === "number" && typeof listing.lng === "number"
      ? { lat: listing.lat, lng: listing.lng }
      : null;
  const radius = th.radiusKm ?? 5;
  if (origin && destination) {
    const away = distanceKm(origin, destination);
    const inside = away <= radius;
    add(
      "location",
      "Distance from you",
      inside
        ? 1 - 0.35 * (away / Math.max(radius, 0.5))
        : Math.max(0.05, 0.6 - (away - radius) * 0.03),
      `${away.toFixed(1)} km away · ${inside ? "inside" : "outside"} your ${radius} km radius`,
      inside && away <= radius * 0.5
        ? `Close by — ${away < 1 ? `${Math.round(away * 1000)} m` : `${away.toFixed(1)} km`} from you`
        : undefined,
    );
  } else {
    add(
      "location",
      "Distance from you",
      0.6,
      origin ? "This listing has no address on file yet" : "Add your address to score distance",
    );
  }

  add(
    "spaceType",
    "Type of space",
    spaceSim(th.spaceType, lh.spaceType),
    `${label("spaceType", th.spaceType)} · ${label("spaceType", lh.spaceType)}`,
    th.spaceType === lh.spaceType
      ? `Both looking at a ${label("spaceType", th.spaceType).toLowerCase()}`
      : undefined,
    "Type of space doesn't match what was asked for",
  );

  add(
    "bedrooms",
    "Bedrooms",
    bedroomsSim(th.bedrooms, lh.bedrooms),
    `${th.bedrooms === 0 ? "Studio" : th.bedrooms + " bed"} · ${lh.bedrooms === 0 ? "studio" : lh.bedrooms + " bed"}`,
    th.bedrooms === lh.bedrooms && th.bedrooms === 0 ? "Both want a studio" : undefined,
    lh.bedrooms < th.bedrooms ? "Fewer bedrooms than asked for" : undefined,
  );

  add(
    "washrooms",
    "Washrooms",
    washroomsSim(th.washrooms, lh.washrooms),
    `${th.washrooms} bath · ${lh.washrooms} bath`,
  );

  add(
    "parking",
    "Parking",
    parkingSim(th.parking, lh.parking),
    `${label("parking", th.parking)} · ${lh.parking === "none" ? "no parking" : "parking included"}`,
    th.parking === "required" && lh.parking !== "none" ? "Parking requirement is covered" : undefined,
    "Parking requirement isn't covered",
  );

  add(
    "furnished",
    "Furnished",
    furnishedSim(th.furnished, lh.furnished),
    `${label("furnished", th.furnished)} · ${label("furnished", lh.furnished)}`,
    th.furnished === lh.furnished ? `Agree on ${label("furnished", th.furnished).toLowerCase()}` : undefined,
    "Furnishing expectations differ",
  );

  add(
    "lease",
    "Lease length",
    leaseSim(th.lease, lh.lease),
    `${label("lease", th.lease)} · ${label("lease", lh.lease)}`,
    th.lease === lh.lease ? `Same lease length — ${label("lease", th.lease).toLowerCase()}` : undefined,
    "Different lease lengths",
  );

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = criteria.reduce((sum, c) => sum + c.weight * c.score, 0);
  const score = Math.max(0, Math.min(100, Math.round((earned / totalWeight) * 100)));

  return {
    score,
    criteria,
    commonalities: commonalities.slice(0, 8),
    watchouts: watchouts.slice(0, 4),
  };
}

export const FAIRNESS_NOTES = {
  version: SCORE_VERSION,
  scored: [
    "Lifestyle answers: schedule, sleep, social style, tidiness, noise, hobbies, pets, smoking, kitchen use, cooking smells, repairs turnaround",
    "Home answers: space type, area, budget, timing, bedrooms, washrooms, parking, furnishing, lease length, distance from the tenant's address",
  ],
  neverScored: [
    "Name, photo and contact details",
    "Age (every user is verified 18+)",
    "Family status, marital status or whether someone has children",
    "Disability, accommodation needs or use of a service animal",
    "Religion, creed, race, ancestry, colour, place of origin, citizenship",
    "Sex, sexual orientation, gender identity or gender expression",
    "Receipt of public assistance or source of income",
  ],
  rules: [
    "Identity fields are never passed to the scorer; only questionnaire and home fields are read.",
    "Preferences touching a protected ground are stored beside the profile, shown to the user as excluded, and never read by the engine.",
    "Every score lists the criteria and weights that produced it, so a person can check it.",
    "Deservia suggests, never decides: the landlord chooses, the tenant can walk away, and either side can withdraw.",
  ],
};
