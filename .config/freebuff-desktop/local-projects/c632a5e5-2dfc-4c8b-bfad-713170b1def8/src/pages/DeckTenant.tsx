import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { FilterSummary, Listing, Profile, Recommendation } from "../../shared/types";
import { bedroomLabel, budgetLabel, label, washroomLabel } from "../../shared/types";
import { formatKm } from "../../shared/geo";
import { ListingDetail } from "../components/ListingDetail";
import { MatchCard } from "../components/MatchCard";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { EmptyState, Notice, ScoreRing, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";
import { accentStyle, useAsync } from "../lib/ui";

type RecResponse = {
  role: "tenant" | "landlord";
  items: Recommendation[];
  weights: { key: string; label: string; weight: number; kind: string }[];
  excluded: string[];
  listing: Listing | null;
  listings: Listing[];
  filters: FilterSummary | null;
};

type Decision = "like" | "pass";

/** A swipe belongs to one listing, not one landlord. */
function cardKey(item: Recommendation): string {
  return item.listing?.id ?? item.other.id;
}

function tier(score: number): string {
  if (score >= 85) return "Great fit";
  if (score >= 70) return "Good fit";
  if (score >= 55) return "Possible fit";
  return "Low fit";
}

function lifestyleTags(profile: Profile, listing?: Listing | null): string[] {
  const tags = [
    label("tidiness", profile.lifestyle.tidiness),
    label("music", profile.lifestyle.music),
    label("smoking", listing ? listing.smokingPolicy : profile.lifestyle.smoking),
    label("pets", listing ? listing.petsPolicy : profile.lifestyle.pets),
    label("schedule", profile.lifestyle.schedule),
    label("chronotype", profile.lifestyle.chronotype),
  ];
  return [...new Set(tags)];
}

export default function DeckTenant() {
  const { session, refresh } = useSession();
  const profile = session!.profile;

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [phase, setPhase] = useState<"swipe" | "review" | "done">("swipe");
  const [view, setView] = useState<"deck" | "list">("deck");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<Recommendation | null>(null);
  const [detailFor, setDetailFor] = useState<Recommendation | null>(null);
  const [drag, setDrag] = useState({ x: 0, active: false });
  const [compare, setCompare] = useState<string[]>([]);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const { data, loading, error: loadError, reload } = useAsync(
    () => api<RecResponse>("/api/recommendations"),
    [profile.id],
  );

  const items = data?.items ?? [];
  const liked = items.filter((item) => decisions[cardKey(item)] === "like");
  const passed = items.filter((item) => decisions[cardKey(item)] === "pass");
  const undecided = items.filter((item) => !decisions[cardKey(item)]);
  // Exactly the ten the server ranked, in order.
  const queue = undecided;

  /**
   * A swipe is saved the moment it is made, so "interested" in the deck and
   * "Liked listings" can never disagree. Finalize stays as a confirmation.
   */
  function persist(item: Recommendation, action: Decision) {
    void api("/api/interest", {
      method: "POST",
      body: JSON.stringify({
        profileId: item.other.id,
        listingId: item.listing?.id,
        action,
      }),
    }).catch((cause) => setError(errorMessage(cause)));
  }

  function decide(item: Recommendation, action: Decision) {
    const next = { ...decisions, [cardKey(item)]: action };
    setDecisions(next);
    setDrag({ x: 0, active: false });
    setError(null);
    persist(item, action);
    if (view === "deck" && items.every((entry) => next[cardKey(entry)])) {
      setPhase("review");
    }
  }

  function move(key: string, action: Decision) {
    setDecisions((current) => ({ ...current, [key]: action }));
    setDragId(null);
    const item = items.find((entry) => cardKey(entry) === key);
    if (item) persist(item, action);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, a, select, input, textarea")) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ x: 0, active: true });
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!pointerStart.current) return;
    setDrag({ x: event.clientX - pointerStart.current.x, active: true });
  }

  function onPointerUp(event: React.PointerEvent<HTMLElement>) {
    if (!pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.x;
    pointerStart.current = null;
    const card = queue[0];
    if (card && Math.abs(dx) > 110) {
      decide(card, dx > 0 ? "like" : "pass");
    } else {
      setDrag({ x: 0, active: false });
    }
  }

  async function finalize() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const item of items) {
        const action = decisions[cardKey(item)];
        if (!action) continue;
        await api("/api/interest", {
          method: "POST",
          body: JSON.stringify({
            profileId: item.other.id,
            listingId: item.listing?.id,
            action,
          }),
        });
      }
      await reload();
      await refresh();
      setPhase("done");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Scoring your matches…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState emoji="🏡" title="We couldn't load your deck">
          {loadError}
        </EmptyState>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState emoji="🏡" title="No listings available yet">
          There are no listings to rank yet. As soon as a landlord publishes one, it appears here
          with its score and distance.{" "}
          <Link to="/app/questionnaire?scope=filters" className="font-bold text-crimson">
            Edit filters →
          </Link>
        </EmptyState>
      </div>
    );
  }

  const current = queue[0];

  if (phase === "done") {
    return (
      <div>
        <div className="card p-5 sm:p-6">
          <div className="eyebrow">Your shortlist</div>
          <h1 className="section-title mt-1.5">Requests sent</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
            You sent {liked.length} {liked.length === 1 ? "request" : "requests"}. When a landlord
            accepts yours, it becomes a mutual match in My matches and the rental application and
            viewing schedule unlock.
          </p>

          <div className="mt-5 space-y-2.5">
            {liked.length ? (
              liked.map((item) => (
                <div
                  key={cardKey(item)}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-[#fffafc] p-3"
                >
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl"
                    style={accentStyle(item.listing?.accent ?? "#f6edf2")}
                  >
                    {item.listing?.emoji ?? "🏡"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-extrabold">
                      {item.listing?.title ?? item.other.name}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {item.listing
                        ? `${item.listing.area} · ${budgetLabel(item.listing.rent)}/mo · ${bedroomLabel(item.listing.bedrooms)}`
                        : item.other.tagline}
                    </p>
                  </div>
                  {item.match?.status === "mutual" || item.match?.status === "accepted" ? (
                    <span className="chip chip-ok">Accepted · mutual</span>
                  ) : (
                    <span className="chip chip-warn">Requested</span>
                  )}
                  <ScoreRing score={item.score.score} size={46} />
                </div>
              ))
            ) : (
              <EmptyState emoji="🤍" title="No interested listings yet">
                You didn&apos;t mark any listing as interested, so there is nothing to wait on. Start
                the deck again to review the listings.
              </EmptyState>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link to="/app/matches" className="btn btn-primary btn-sm">
              Open My matches
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDecisions({});
                setPhase("swipe");
                setView("deck");
              }}
            >
              Start the deck again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Before you finalize</div>
            <h1 className="section-title mt-1.5">Review your swipes</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
              These are the listings you swiped through. Drag a card between the two columns — or use
              the arrow on a card — to change your decision before you finalize.
            </p>
          </div>
          <Link to="/app/questionnaire?scope=filters" className="btn btn-ghost btn-sm">
            Edit filters
          </Link>
        </div>

        {error ? (
          <div className="mt-4">
            <Notice tone="warn">{error}</Notice>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ReviewColumn
            title="Interested"
            tone="like"
            draggingId={dragId}
            items={liked}
            empty="Drop a listing here to show interest."
            arrow="←"
            arrowLabel="Move to not interested"
            onDrop={(id) => move(id, "like")}
            onArrow={(id) => move(id, "pass")}
            onDragStart={setDragId}
            onDragEnd={() => setDragId(null)}
          />
          <ReviewColumn
            title="Not interested"
            tone="pass"
            draggingId={dragId}
            items={passed}
            empty="Drop a listing here to pass on it."
            arrow="→"
            arrowLabel="Move to interested"
            onDrop={(id) => move(id, "pass")}
            onArrow={(id) => move(id, "like")}
            onDragStart={setDragId}
            onDragEnd={() => setDragId(null)}
          />
        </div>

        {undecided.length ? (
          <p className="mt-3 text-[12px] text-muted">
            {undecided.length} {undecided.length === 1 ? "listing is" : "listings are"} still
            undecided and won&apos;t appear on your shortlist.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4">
          <p className="text-[12.5px] text-muted">
            {liked.length} interested · {passed.length} not interested
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPhase("swipe")}
              disabled={busy}
            >
              ← Keep swiping
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void finalize()}
              disabled={busy}
            >
              {busy ? "Finalizing…" : "Finalize"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Ranked homes</div>
          <h1 className="section-title mt-1.5">Your match deck</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Your top {items.length} listings, ranked from highest to lowest match score. Liking one
            sends a request; the landlord accepts or declines it.
          </p>
        </div>
        <span className="text-[12px] text-muted">
          {items.length - undecided.length} of {items.length} reviewed
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-white p-1 shadow-sm">
          <button
            type="button"
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${
              view === "deck" ? "bg-gradient-to-br from-crimson to-pink text-white" : "text-muted"
            }`}
            onClick={() => setView("deck")}
          >
            Swipe deck
          </button>
          <button
            type="button"
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${
              view === "list" ? "bg-gradient-to-br from-crimson to-pink text-white" : "text-muted"
            }`}
            onClick={() => setView("list")}
          >
            List view
          </button>
        </div>

        <Link to="/app/compare" className="btn btn-ghost btn-sm ml-auto">
          Compare two
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhase("review")}>
          Review my swipes
        </button>
      </div>

      {compare.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5">
          <span className="text-[12px] font-semibold">
            {compare.length} of 2 selected to compare
          </span>
          <Link
            to={`/app/compare?a=${compare[0]}&b=${compare[1] ?? ""}`}
            className={`btn btn-primary btn-sm ml-auto ${compare.length < 2 ? "pointer-events-none opacity-50" : ""}`}
          >
            Compare side by side
          </Link>
          <button
            type="button"
            className="text-[12px] font-semibold text-muted hover:text-crimson"
            onClick={() => setCompare([])}
          >
            Clear
          </button>
        </div>
      ) : null}

      {data?.filters ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-white px-3 py-2.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
            Filters
          </span>
          <span className="chip chip-muted">{data.filters.area}</span>
          {data.filters.radiusKm ? (
            <span className="chip chip-muted">
              Within {data.filters.radiusKm} km
              {data.filters.centerLabel ? ` of ${data.filters.centerLabel}` : ""}
            </span>
          ) : null}
          {data.filters.unitTypes.length ? (
            <span className="chip chip-muted">{data.filters.unitTypes.join(" / ")} BHK</span>
          ) : (
            <span className="chip chip-muted">Any size</span>
          )}
          {data.filters.priceNoPref ? (
            <span className="chip chip-muted">Any price</span>
          ) : (
            <span className="chip chip-muted">
              {budgetLabel(data.filters.priceMin)}–{budgetLabel(data.filters.priceMax)}/mo
            </span>
          )}
          <Link
            to="/app/questionnaire?scope=filters"
            className="ml-auto text-[12px] font-bold text-crimson underline decoration-crimson/30 underline-offset-2"
          >
            Edit filters
          </Link>
        </div>
      ) : null}

      {data?.filters?.fallbackCount ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          {data.filters.survived > 0
            ? `Only ${data.filters.survived} ${
                data.filters.survived === 1 ? "listing is" : "listings are"
              } inside your ${data.filters.radiusKm ?? 5} km radius, so ${data.filters.fallbackCount} high-scoring ${
                data.filters.fallbackCount === 1 ? "listing was" : "listings were"
              } added from outside it.`
            : `No listing falls inside your ${data.filters.radiusKm ?? 5} km radius, so the ten closest high-scoring listings are shown and marked “Outside your radius”.`}
        </p>
      ) : null}

      {data?.filters?.shortPool ? (
        <div className="mt-2">
          <Notice tone="warn">
            Fewer than ten listings are available to you right now, so all {data.items.length} are
            shown.
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const listingId = item.listing?.id ?? item.other.id;
            return (
              <MatchCard
                key={cardKey(item)}
                item={item}
                rank={item.rank ?? items.indexOf(item) + 1}
                role="tenant"
                decision={decisions[cardKey(item)] ?? null}
                onInterest={async (_profileId, action) => {
                  decide(item, action);
                }}
                compareSelected={compare.includes(listingId)}
                compareDisabled={compare.length >= 2}
                onCompareChange={(checked) =>
                  setCompare((current) =>
                    checked
                      ? [...current.filter((entry) => entry !== listingId), listingId].slice(-2)
                      : current.filter((entry) => entry !== listingId),
                  )
                }
              />
            );
          })}
        </div>
      ) : current ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div>
            <article
              key={cardKey(current)}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                pointerStart.current = null;
                setDrag({ x: 0, active: false });
              }}
              className="card relative touch-pan-y select-none overflow-hidden p-5 sm:p-6"
              style={{
                transform: `translateX(${drag.x}px) rotate(${drag.x / 24}deg)`,
                transition: drag.active ? "none" : "transform 0.2s ease",
              }}
            >
              <div
                className="pointer-events-none absolute inset-y-0 left-0 grid w-28 place-items-center bg-gradient-to-r from-[#a4123f]/20 to-transparent text-[26px] font-extrabold text-crimson"
                style={{ opacity: drag.x < -30 ? Math.min(1, -drag.x / 120) : 0 }}
                aria-hidden
              >
                PASS
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 right-0 grid w-28 place-items-center bg-gradient-to-l from-[#e5197d]/25 to-transparent text-[26px] font-extrabold text-pink"
                style={{ opacity: drag.x > 30 ? Math.min(1, drag.x / 120) : 0 }}
                aria-hidden
              >
                LIKE
              </div>

              <div className="flex items-start gap-3.5">
                {current.listing ? (
                  <div
                    className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-2xl text-3xl"
                    style={accentStyle(current.listing.accent)}
                  >
                    {current.listing.emoji}
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-crimson">
                      #{current.rank ?? items.indexOf(current) + 1} · {tier(current.score.score)}
                    </span>
                    {current.match?.status === "requested" ? (
                      <span className="chip chip-warn">Request sent</span>
                    ) : null}
                    {current.outsideRadius || current.fallback ? (
                      <span className="chip chip-warn">Outside your radius</span>
                    ) : null}
                  </div>

                  <h2 className="text-[21px] font-extrabold leading-tight">
                    {current.listing?.title ?? current.other.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted">
                    {current.listing
                      ? `${current.listing.area} · ${budgetLabel(current.listing.rent)}/mo · ${bedroomLabel(current.listing.bedrooms)} · ${washroomLabel(current.listing.washrooms)} · ${label("lease", current.listing.lease)}`
                      : current.other.tagline}
                  </p>
                  {current.distanceKm !== undefined && current.distanceKm !== null ? (
                    <p className="mt-1 text-[12.5px] font-semibold text-crimson">
                      {formatKm(current.distanceKm)} from your address
                    </p>
                  ) : null}
                  <p className="mt-1 text-[12.5px] text-muted">
                    Hosted by {current.other.name} · {current.other.tagline}
                  </p>
                </div>

                <ScoreRing score={current.score.score} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {lifestyleTags(current.other, current.listing).map((tag) => (
                  <span key={tag} className="chip chip-muted">
                    {tag}
                  </span>
                ))}
              </div>

              {current.score.commonalities.length ? (
                <div className="mt-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
                    Things in common
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {current.score.commonalities.slice(0, 4).map((common) => (
                      <span key={common} className="chip chip-ok">
                        ✓ {common}
                      </span>
                    ))}
                    {current.score.commonalities.length > 4 ? (
                      <span className="chip chip-muted">
                        +{current.score.commonalities.length - 4} more
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {current.score.watchouts.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {current.score.watchouts.slice(0, 2).map((watch) => (
                    <span key={watch} className="chip chip-warn">
                      ⚠ {watch}
                    </span>
                  ))}
                </div>
              ) : null}

              {current.listing ? (
                <button
                  type="button"
                  className="mt-3 text-[12px] font-bold text-crimson underline decoration-crimson/30 underline-offset-2"
                  onClick={() => setDetailFor(current)}
                >
                  View full listing details →
                </button>
              ) : null}

              <div className="mt-5 flex items-center gap-2.5 border-t border-line pt-4">
                <button
                  type="button"
                  className="grid h-12 w-12 place-items-center rounded-full border-2 border-line bg-white text-xl text-muted transition hover:border-crimson hover:text-crimson"
                  onClick={() => decide(current, "pass")}
                  aria-label="Not interested"
                >
                  ✕
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReasonFor(current)}
                >
                  See why
                </button>
                <span className="hidden text-[11px] text-muted sm:inline">or drag the card</span>
                <button
                  type="button"
                  className="ml-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-crimson to-pink text-xl text-white shadow-lift transition hover:scale-105"
                  onClick={() => decide(current, "like")}
                  aria-label="Interested"
                >
                  ♥
                </button>
              </div>
            </article>

            <p className="mt-3 text-center text-[11.5px] text-muted">
              {items.length - undecided.length} of {items.length} seen · every swipe is saved
              straight away.
            </p>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <div className="card p-4">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Edit your answers
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Filters come from questions 1–2. Questions 3–15 are edited from My account.
              </p>
              <div className="mt-2.5 grid gap-1.5">
                <Link to="/app/questionnaire?scope=filters" className="btn btn-ghost btn-sm w-full">
                  Edit filters · Q1–2
                </Link>
                <Link to="/app/profile" className="btn btn-ghost btn-sm w-full">
                  Edit answers in My account
                </Link>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Your swipes
              </h2>
              <p className="mt-1.5 text-[12.5px] text-muted">
                {liked.length} interested · {passed.length} not interested
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-2.5 w-full"
                onClick={() => setPhase("review")}
              >
                Review and finalize
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="mx-auto mt-6 max-w-lg">
          <EmptyState emoji="🎉" title="You've swiped every listing">
            Now review the ones you liked and the ones you passed before finalizing your choices.
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPhase("review")}
              >
                Review my swipes
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView("list")}>
                List view
              </button>
            </div>
          </EmptyState>
        </div>
      )}

      {reasonFor ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">See why</p>
                <h2 className="text-[20px] font-extrabold">
                  {reasonFor.listing?.title ?? reasonFor.other.name} · {reasonFor.score.score}%
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReasonFor(null)}
                className="grid h-8 w-8 place-items-center rounded-full bg-[#f6edf2] text-muted hover:text-crimson"
                aria-label="Close score breakdown"
              >
                ✕
              </button>
            </div>
            <div className="mt-3">
              <ScoreBreakdown score={reasonFor.score} excluded={data?.excluded} />
            </div>
          </div>
        </div>
      ) : null}

      {detailFor?.listing ? (
        <ListingDetail
          listing={detailFor.listing}
          landlordName={detailFor.other.name}
          onClose={() => setDetailFor(null)}
        />
      ) : null}
    </div>
  );
}

function ReviewColumn({
  title,
  tone,
  items,
  empty,
  arrow,
  arrowLabel,
  draggingId,
  onDrop,
  onArrow,
  onDragStart,
  onDragEnd,
}: {
  title: string;
  tone: "like" | "pass";
  items: Recommendation[];
  empty: string;
  arrow: string;
  arrowLabel: string;
  draggingId: string | null;
  onDrop: (profileId: string) => void;
  onArrow: (profileId: string) => void;
  onDragStart: (profileId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
      className={`rounded-3xl border p-3 ${
        tone === "like" ? "border-[#f2c2d7] bg-[#fff6fa]" : "border-line bg-white"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13.5px] font-extrabold">
          {tone === "like" ? "♥ " : "✕ "}
          {title}
        </h2>
        <span className="chip chip-muted">{items.length}</span>
      </div>
      <p className="mt-0.5 px-1 text-[11.5px] text-muted">
        {tone === "like" ? "Swiped right · interested" : "Swiped left · not interested"}
      </p>

      <div className="mt-2.5 space-y-2">
        {items.length ? (
          items.map((item) => (
            <article
              key={cardKey(item)}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", cardKey(item));
                event.dataTransfer.effectAllowed = "move";
                onDragStart(cardKey(item));
              }}
              onDragEnd={onDragEnd}
              className={`cursor-grab rounded-2xl border border-line bg-white p-2.5 shadow-sm active:cursor-grabbing ${
                draggingId === cardKey(item) ? "opacity-40" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
                  style={accentStyle(item.listing?.accent ?? "#f6edf2")}
                >
                  {item.listing?.emoji ?? "🏡"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold">
                    {item.listing?.title ?? item.other.name}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {item.listing
                      ? `${item.listing.area} · ${budgetLabel(item.listing.rent)}/mo`
                      : item.other.tagline}
                  </p>
                </div>
                <span className="text-[11px] font-extrabold text-crimson">
                  {item.score.score}%
                </span>
                <button
                  type="button"
                  onClick={() => onArrow(cardKey(item))}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-[12px] text-muted hover:border-crimson hover:text-crimson"
                  aria-label={arrowLabel}
                  title={arrowLabel}
                >
                  {arrow}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-muted">
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}
