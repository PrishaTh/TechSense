import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  Home,
  Listing,
  MatchView,
  Profile,
  Recommendation,
  ScoreResult,
} from "../../shared/types";
import {
  bedroomLabel,
  budgetLabel,
  hobbyLabel,
  label,
  washroomLabel,
} from "../../shared/types";
import { EmptyState, Notice, ScoreRing, Spinner } from "../components/ui";
import { formatKm } from "../../shared/geo";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { accentStyle, useAsync } from "../lib/ui";

type RecResponse = { items: Recommendation[] };
type RequestsResponse = { listing: Listing | null; requests: MatchView[] };

type Row = { label: string; a: string; b: string; better: -1 | 0 | 1 };

type Side = {
  key: string;
  title: string;
  subtitle: string;
  listing: Listing | null;
  profile: Profile;
  score: ScoreResult;
  distanceKm: number | null;
  photo: string | null;
};

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function availableAt(listing: Listing): number {
  if (listing.availableFrom) {
    const time = new Date(`${listing.availableFrom}T12:00:00`).getTime();
    if (!Number.isNaN(time)) return time;
  }
  if (listing.available === "within_month") return Date.now() + 7 * 86400000;
  if (listing.available === "1_3_months") return Date.now() + 60 * 86400000;
  return Date.now() + 365 * 86400000;
}

/** Adds a plain row only when the two values actually differ. */
function compareText(rows: Row[], name: string, left: string, right: string, better: -1 | 0 | 1 = 0) {
  if (norm(left) === norm(right)) return;
  rows.push({ label: name, a: left, b: right, better });
}

function compareNumber(
  rows: Row[],
  name: string,
  left: number | null,
  right: number | null,
  format: (value: number) => string,
  higherIsBetter: boolean,
) {
  if (left === null && right === null) return;
  if (left !== null && right !== null && left === right) return;
  let better: -1 | 0 | 1 = 0;
  if (left !== null && right !== null) {
    better = (higherIsBetter ? left > right : left < right) ? -1 : 1;
  }
  rows.push({
    label: name,
    a: left === null ? "Not listed" : format(left),
    b: right === null ? "Not listed" : format(right),
    better,
  });
}

/** Amenities and utilities are compared item by item, not as one long string. */
function compareList(rows: Row[], name: string, left: string[], right: string[]) {
  const aSet = new Set(left.map(norm));
  const bSet = new Set(right.map(norm));
  const all = [...left, ...right].filter(
    (item, index, list) => list.findIndex((other) => norm(other) === norm(item)) === index,
  );
  for (const item of all) {
    const inA = aSet.has(norm(item));
    const inB = bSet.has(norm(item));
    if (inA === inB) continue;
    rows.push({
      label: `${name}: ${item}`,
      a: inA ? "Yes" : "No",
      b: inB ? "Yes" : "No",
      better: inA ? -1 : 1,
    });
  }
}

function listingRows(left: Side, right: Side, wantedBeds: number): Row[] {
  const l = left.listing;
  const r = right.listing;
  if (!l || !r) return [];
  const rows: Row[] = [];

  compareText(rows, "Address", l.address ?? "Not listed", r.address ?? "Not listed");
  compareText(
    rows,
    "Distance from your address",
    formatKm(left.distanceKm),
    formatKm(right.distanceKm),
  );
  compareText(rows, "Area", l.area, r.area);
  compareNumber(rows, "Rent", l.rent, r.rent, (v) => `${budgetLabel(v)}/mo`, false);
  compareNumber(rows, "Bedrooms", l.bedrooms, r.bedrooms, bedroomLabel, false);
  compareNumber(
    rows,
    "Bathrooms",
    l.washrooms,
    r.washrooms,
    (v) => washroomLabel(v),
    true,
  );
  compareNumber(
    rows,
    "Size",
    l.sizeSqft ?? null,
    r.sizeSqft ?? null,
    (v) => `${v.toLocaleString("en-CA")} sq ft`,
    true,
  );
  compareNumber(
    rows,
    "Available from",
    availableAt(l),
    availableAt(r),
    (v) =>
      new Date(v).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    false,
  );
  compareText(rows, "Lease term", label("lease", l.lease), label("lease", r.lease));
  compareText(
    rows,
    "Pets",
    l.petsDetail ?? label("pets", l.petsPolicy),
    r.petsDetail ?? label("pets", r.petsPolicy),
  );
  compareText(
    rows,
    "Smoking",
    l.smokingDetail ?? label("smoking", l.smokingPolicy),
    r.smokingDetail ?? label("smoking", r.smokingPolicy),
  );
  compareText(
    rows,
    "Parking",
    l.parkingDetail ?? (l.parking === "none" ? "No parking" : "Parking"),
    r.parkingDetail ?? (r.parking === "none" ? "No parking" : "Parking"),
  );
  compareText(rows, "Furnished", label("furnished", l.furnished), label("furnished", r.furnished));
  compareText(rows, "Type", label("spaceType", l.spaceType), label("spaceType", r.spaceType));
  compareText(rows, "Floor / level", l.floorLevel ?? "Not listed", r.floorLevel ?? "Not listed");
  compareText(
    rows,
    "Heating / cooling",
    l.heatingCooling ?? "Not listed",
    r.heatingCooling ?? "Not listed",
  );
  compareText(rows, "Laundry", l.laundry ?? "Not listed", r.laundry ?? "Not listed");
  compareText(rows, "Entrance", l.entrance ?? "Not listed", r.entrance ?? "Not listed");
  compareText(rows, "Kitchen", l.kitchen ?? "Not listed", r.kitchen ?? "Not listed");
  compareText(rows, "Outdoor space", l.outdoor ?? "Not listed", r.outdoor ?? "Not listed");
  compareText(
    rows,
    "Description",
    l.blurb || "Not listed",
    r.blurb || "Not listed",
  );
  compareList(rows, "Included in rent", l.utilities ?? [], r.utilities ?? []);
  compareList(rows, "Amenity", l.amenities ?? [], r.amenities ?? []);
  compareText(
    rows,
    "Home photo",
    l.photos?.length ? "Uploaded" : "None",
    r.photos?.length ? "Uploaded" : "None",
  );

  if (left.score.score !== right.score.score) {
    rows.push({
      label: "Overall match",
      a: `${left.score.score}%`,
      b: `${right.score.score}%`,
      better: left.score.score > right.score.score ? -1 : 1,
    });
  }

  // Bedroom fit is already reflected above; keep the preference out of the
  // table unless it changed a value.
  void wantedBeds;
  return rows;
}

function tenantRows(left: Side, right: Side): Row[] {
  const l = left.profile.home as Home | null;
  const r = right.profile.home as Home | null;
  const rows: Row[] = [];
  const lt = left.profile.lifestyle;
  const rt = right.profile.lifestyle;

  compareText(rows, "Name", left.profile.name, right.profile.name);
  compareText(
    rows,
    "Budget",
    l ? `${budgetLabel(l.budget)}/mo` : "Not listed",
    r ? `${budgetLabel(r.budget)}/mo` : "Not listed",
  );
  compareText(rows, "Area", l?.area ?? "Not listed", r?.area ?? "Not listed");
  compareText(
    rows,
    "Bedrooms wanted",
    l ? bedroomLabel(l.bedrooms) : "Not listed",
    r ? bedroomLabel(r.bedrooms) : "Not listed",
  );
  compareText(
    rows,
    "Lease length",
    l ? label("lease", l.lease) : "Not listed",
    r ? label("lease", r.lease) : "Not listed",
  );
  compareText(
    rows,
    "Move-in timing",
    l ? label("timing", l.timing) : "Not listed",
    r ? label("timing", r.timing) : "Not listed",
  );
  compareText(rows, "Tidiness", label("tidiness", lt.tidiness), label("tidiness", rt.tidiness));
  compareText(rows, "Schedule", label("schedule", lt.schedule), label("schedule", rt.schedule));
  compareText(
    rows,
    "Early bird / night owl",
    label("chronotype", lt.chronotype),
    label("chronotype", rt.chronotype),
  );
  compareText(rows, "Social style", label("social", lt.social), label("social", rt.social));
  compareText(rows, "Music & noise", label("music", lt.music), label("music", rt.music));
  compareText(rows, "Pets", label("pets", lt.pets), label("pets", rt.pets));
  compareText(rows, "Smoking", label("smoking", lt.smoking), label("smoking", rt.smoking));
  compareText(
    rows,
    "Kitchen use",
    label("kitchenUse", lt.kitchenUse),
    label("kitchenUse", rt.kitchenUse),
  );
  compareText(rows, "Cooking smells", label("smells", lt.smells), label("smells", rt.smells));
  compareText(
    rows,
    "Repairs turnaround",
    l ? label("issueSpeed", l.issueSpeed) : "Not listed",
    r ? label("issueSpeed", r.issueSpeed) : "Not listed",
  );
  compareList(
    rows,
    "Hobby",
    (lt.hobbies ?? []).map(hobbyLabel),
    (rt.hobbies ?? []).map(hobbyLabel),
  );
  compareText(
    rows,
    "What they are looking for",
    left.profile.expectations || "Not listed",
    right.profile.expectations || "Not listed",
  );

  if (left.score.score !== right.score.score) {
    rows.push({
      label: "Match score",
      a: `${left.score.score}%`,
      b: `${right.score.score}%`,
      better: left.score.score > right.score.score ? -1 : 1,
    });
  }
  return rows;
}

export default function Compare() {
  const { session } = useSession();
  const profile = session!.profile;
  const isLandlord = profile.role === "landlord";
  const [params, setParams] = useSearchParams();

  const tenant = useAsync<RecResponse>(() => api<RecResponse>("/api/recommendations"), [
    profile.id,
  ]);
  const landlord = useAsync<RequestsResponse>(
    () =>
      api<RequestsResponse>(
        `/api/requests${
          params.get("listing") ? `?listingId=${encodeURIComponent(params.get("listing")!)}` : ""
        }`,
      ),
    [profile.id, params.get("listing")],
  );

  const [a, setA] = useState(params.get("a") ?? "");
  const [b, setB] = useState(params.get("b") ?? "");

  useEffect(() => {
    const nextA = params.get("a") ?? "";
    const nextB = params.get("b") ?? "";
    if (nextA) setA(nextA);
    if (nextB) setB(nextB);
  }, [params]);

  const sides = useMemo<Side[]>(() => {
    if (isLandlord) {
      return (landlord.data?.requests ?? []).map((view) => ({
        key: view.other.id,
        title: view.other.name,
        subtitle: `${view.status === "requested" ? "Requested" : "Accepted"} · ${
          view.listing?.title ?? "listing"
        }`,
        listing: view.listing,
        profile: view.other,
        score: view.score,
        distanceKm: null,
        photo: null,
      }));
    }
    return (tenant.data?.items ?? [])
      .filter((item): item is Recommendation & { listing: Listing } => Boolean(item.listing))
      .map((item) => ({
        key: item.listing.id,
        title: item.listing.title,
        subtitle: `${item.listing.area} · ${budgetLabel(item.listing.rent)}/mo`,
        listing: item.listing,
        profile: item.other,
        score: item.score,
        distanceKm: item.distanceKm ?? null,
        photo: item.listing.photos?.[0] ?? null,
      }));
  }, [isLandlord, landlord.data, tenant.data]);

  const left = sides.find((side) => side.key === a) ?? null;
  const right = sides.find((side) => side.key === b) ?? null;

  function pick(side: "a" | "b", value: string) {
    if (side === "a") setA(value);
    else setB(value);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (side === "a") next.set("a", value);
      else next.set("b", value);
      if (side === "b" && next.get("a") === value) next.delete("a");
      if (side === "a" && next.get("b") === value) next.delete("b");
      return next;
    });
  }

  function swap() {
    setA(b);
    setB(a);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("a", b);
      next.set("b", a);
      return next;
    });
  }

  if (tenant.loading || landlord.loading) {
    return (
      <div className="py-16">
        <Spinner label="Loading your recommendations…" />
      </div>
    );
  }
  const loadError = isLandlord ? landlord.error : tenant.error;
  if (loadError) return <Notice tone="warn">{loadError}</Notice>;

  if (sides.length < 2) {
    return (
      <EmptyState
        emoji="⚖️"
        title={isLandlord ? "Add another request to compare" : "Add another listing to compare"}
      >
        {isLandlord ? (
          <>
            {sides.length === 0
              ? "Tenants who request your listing appear on your Requests page."
              : "You have one request so far. When a second tenant requests this listing you can compare them here."}{" "}
            <Link to="/app/requests" className="font-bold text-crimson">
              Open requests →
            </Link>
          </>
        ) : (
          <>
            {sides.length === 0
              ? "Finish your questionnaire and open your deck first."
              : "You have one listing to compare so far. Two listings are needed for a side-by-side view."}{" "}
            <Link to="/app/deck" className="font-bold text-crimson">
              Open the deck →
            </Link>
          </>
        )}
      </EmptyState>
    );
  }

  const wantedBeds = profile.home?.bedrooms ?? 1;
  const wantedBudget = profile.home?.budget ?? 0;
  const rows =
    left && right
      ? isLandlord
        ? tenantRows(left, right)
        : listingRows(left, right, wantedBeds)
      : [];

  const scoreDiff = left && right ? left.score.score - right.score.score : 0;
  const winner = scoreDiff === 0 ? null : scoreDiff > 0 ? "A" : "B";
  const mainDiffs = rows
    .filter((row) => row.better !== 0)
    .slice(0, 2)
    .map((row) => row.label.toLowerCase());

  const verdict =
    !left || !right
      ? "Pick two items to see which one fits better."
      : rows.length === 0
        ? "These two are identical on every field."
        : winner
          ? `${isLandlord ? "Tenant" : "Listing"} ${winner} fits better (${left.score.score} vs ${
              right.score.score
            })${mainDiffs.length ? `, mainly on ${mainDiffs.join(" and ")}` : ""}.`
          : "Both fit equally well — the differences below are the only things that separate them.";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Side by side</div>
          <h1 className="section-title mt-1.5">Compare</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            {isLandlord
              ? "Two tenants who requested this listing. Only the fields that differ are shown."
              : "Two of your ten recommendations. Only the fields that differ are shown."}
          </p>
        </div>
        <Link to={isLandlord ? "/app/requests" : "/app/deck"} className="btn btn-ghost btn-sm">
          {isLandlord ? "Back to requests" : "Back to the deck"}
        </Link>
      </div>

      <div className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="field-label">{isLandlord ? "Tenant A" : "Listing A"}</span>
          <select className="select" value={a} onChange={(event) => pick("a", event.target.value)}>
            <option value="">Choose…</option>
            {sides.map((side) => (
              <option key={side.key} value={side.key} disabled={side.key === b}>
                {side.title} · {side.subtitle}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={swap}
          disabled={!left || !right}
        >
          ⇄ Swap
        </button>
        <label className="block">
          <span className="field-label">{isLandlord ? "Tenant B" : "Listing B"}</span>
          <select className="select" value={b} onChange={(event) => pick("b", event.target.value)}>
            <option value="">Choose…</option>
            {sides.map((side) => (
              <option key={side.key} value={side.key} disabled={side.key === a}>
                {side.title} · {side.subtitle}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-3">
        <p className="text-[13px] font-bold">{verdict}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {isLandlord
            ? "Only tenants who requested this listing can be compared. Fields both tenants share are left out."
            : `Your budget: ${budgetLabel(wantedBudget)}/mo · ${bedroomLabel(
                wantedBeds,
              )} wanted · distance is measured from your address.`}
        </p>
      </div>

      {left && right ? (
        rows.length ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
            <div className="grid grid-cols-[120px_1fr_1fr] gap-0 border-b border-line bg-mist text-[11px] font-bold uppercase tracking-[0.06em] text-muted sm:grid-cols-[190px_1fr_1fr]">
              <div className="px-3 py-2">Only differences</div>
              <div className="flex items-center gap-2 border-l border-line px-3 py-2">
                {left.photo ? (
                  <img
                    src={left.photo}
                    alt={left.title}
                    className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    className="grid h-7 w-7 place-items-center rounded-lg text-sm"
                    style={accentStyle(left.listing?.accent ?? "#a4123f,#ff5c97")}
                  >
                    {left.listing?.emoji ?? "🏡"}
                  </span>
                )}
                <span className="truncate normal-case tracking-normal text-ink">{left.title}</span>
              </div>
              <div className="flex items-center gap-2 border-l border-line px-3 py-2">
                {right.photo ? (
                  <img
                    src={right.photo}
                    alt={right.title}
                    className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    className="grid h-7 w-7 place-items-center rounded-lg text-sm"
                    style={accentStyle(right.listing?.accent ?? "#a4123f,#ff5c97")}
                  >
                    {right.listing?.emoji ?? "🏡"}
                  </span>
                )}
                <span className="truncate normal-case tracking-normal text-ink">{right.title}</span>
              </div>
            </div>

            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[120px_1fr_1fr] text-[12.5px] sm:grid-cols-[190px_1fr_1fr]"
              >
                <div className="border-b border-line/60 px-3 py-2 text-muted">{row.label}</div>
                <div
                  className={`whitespace-pre-wrap break-words border-b border-l border-line/60 px-3 py-2 ${
                    row.better === -1 ? "font-bold text-[#166534]" : "text-ink/90"
                  }`}
                >
                  {row.a}
                  {row.better === -1 ? <span className="ml-1">✓</span> : null}
                </div>
                <div
                  className={`whitespace-pre-wrap break-words border-b border-l border-line/60 px-3 py-2 ${
                    row.better === 1 ? "font-bold text-[#166534]" : "text-ink/90"
                  }`}
                >
                  {row.b} 
                  {row.better === 1 ? <span className="ml-1">✓</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState emoji="🟰" title="These two are identical on every field.">
              Nothing differs, so there is no table to show.
            </EmptyState>
          </div>
        )
      ) : (
        <div className="mt-4">
          <EmptyState emoji="⚖️" title={isLandlord ? "Choose two tenants" : "Choose two listings"}>
            Pick two above. You can also tick Compare on {isLandlord ? "request" : "listing"} cards.
          </EmptyState>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {left ? <ScoreRing score={left.score.score} size={54} /> : null}
        {right ? <ScoreRing score={right.score.score} size={54} /> : null}
        <p className="text-[11.5px] leading-relaxed text-muted">
          Equal values are normalised before they are dropped: the same number, the same text
          ignoring case and spacing, or the same set of amenities in any order. Fields a listing
          does not carry are shown as “Not listed”, never guessed.
        </p>
      </div>
    </div>
  );
}
