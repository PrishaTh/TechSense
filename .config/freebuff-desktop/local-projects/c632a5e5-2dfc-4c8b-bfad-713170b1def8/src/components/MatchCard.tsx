import { useState } from "react";
import { Link } from "react-router-dom";
import type { Recommendation } from "../../shared/types";
import { bedroomLabel, budgetLabel, label, washroomLabel } from "../../shared/types";
import { errorMessage } from "../lib/api";
import { formatKm } from "../../shared/geo";
import { Avatar, ScoreRing } from "./ui";

type Props = {
  item: Recommendation;
  rank: number;
  role: "tenant" | "landlord";
  decision?: "like" | "pass" | null;
  onInterest: (profileId: string, action: "like" | "pass") => Promise<void>;
  compareSelected?: boolean;
  compareDisabled?: boolean;
  onCompareChange?: (checked: boolean) => void;
};

export function MatchCard({
  item,
  rank,
  role,
  decision = null,
  onInterest,
  compareSelected = false,
  compareDisabled = false,
  onCompareChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { other, listing, score, match } = item;
  const myAction = decision ?? match?.myAction ?? "pending";
  const mutual = match?.status === "mutual" || match?.status === "accepted";
  const declined = match?.status === "declined";
  const position = item.rank ?? rank;
  const title = role === "tenant" && listing ? listing.title : other.name;
  const meta =
    role === "tenant" && listing
      ? `${listing.area} · ${bedroomLabel(listing.bedrooms)} · ${washroomLabel(listing.washrooms)} · ${budgetLabel(listing.rent)}/mo`
      : other.home
        ? `Budget ${budgetLabel(other.home.budget)}/mo · ${other.home.area} · ${label("lease", other.home.lease)} lease`
        : other.tagline;

  const criteria = [...score.criteria].sort((a, b) => b.weight - a.weight);
  const visible = showAll ? criteria : criteria.slice(0, 8);

  async function act(action: "like" | "pass") {
    setBusy(true);
    setError(null);
    try {
      await onInterest(other.id, action);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`card p-4 transition sm:p-5 ${myAction === "pass" ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3.5 sm:gap-4">
        <div className="relative">
          <Avatar emoji={other.avatar} accent={other.accent} size={54} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-crimson">
                  #{position} · {score.score >= 90 ? "Strong fit" : score.score >= 75 ? "Good fit" : "Worth a look"}
                </span>
                {score.score >= 95 ? <span className="chip chip-ok">Top match</span> : null}
                {item.outsideRadius || item.fallback ? (
                  <span className="chip chip-warn">Outside your radius</span>
                ) : null}
                {declined ? <span className="chip chip-muted">Closed</span> : null}
              </div>
              <h3 className="truncate text-[17px] font-extrabold sm:text-lg">{title}</h3>
              <p className="mt-0.5 truncate text-[13px] text-muted">{meta}</p>
              {role === "tenant" && item.distanceKm !== undefined && item.distanceKm !== null ? (
                <p className="mt-0.5 text-[12.5px] font-semibold text-crimson">
                  {formatKm(item.distanceKm)} from your address
                </p>
              ) : null}
              {role === "tenant" ? (
                <p className="mt-1 text-[12.5px] text-muted">
                  Hosted by <span className="font-semibold text-ink">{other.name}</span> ·{" "}
                  {other.tagline}
                </p>
              ) : null}
            </div>
            <ScoreRing score={score.score} />
          </div>

          {score.commonalities.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {score.commonalities.slice(0, 4).map((common) => (
                <span key={common} className="chip chip-ok">
                  ✓ {common}
                </span>
              ))}
              {score.commonalities.length > 4 ? (
                <span className="chip chip-muted">+{score.commonalities.length - 4} more</span>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-muted">
              Few answers line up yet — open the breakdown to see where you differ.
            </p>
          )}

          {score.watchouts.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {score.watchouts.slice(0, 2).map((watch) => (
                <span key={watch} className="chip chip-warn">
                  ⚠ {watch}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {mutual ? (
              <Link to="/app/matches" className="btn btn-primary btn-sm">
                It&apos;s a match →
              </Link>
            ) : myAction === "like" ? (
              <span className="chip chip-muted">
                {declined
                  ? "Request declined — listing no longer available"
                  : decision === "like"
                    ? "♥ Request · in your list"
                    : "♥ Request sent — waiting on the landlord"}
              </span>
            ) : myAction === "pass" ? (
              <span className="chip chip-muted">
                {decision === "pass" ? "Not interested" : "Passed"}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void act("like")}
                >
                  ♥ Request to rent
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void act("pass")}
                >
                  ✕ Pass
                </button>
              </>
            )}
            {onCompareChange ? (
              <label className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#a4123f]"
                  checked={compareSelected}
                  disabled={compareDisabled && !compareSelected}
                  onChange={(event) => onCompareChange(event.target.checked)}
                />
                Compare
              </label>
            ) : null}
            <button
              type="button"
              className={`${onCompareChange ? "" : "ml-auto"} text-[12.5px] font-bold text-crimson underline decoration-crimson/30 underline-offset-2 hover:decoration-crimson`}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Hide the score" : "Why this score?"}
            </button>
          </div>

          {error ? <p className="mt-2 text-[12.5px] font-semibold text-crimson">{error}</p> : null}

          {expanded ? (
            <div className="mt-4 rounded-2xl border border-line bg-[#fffafc] p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                  How this {score.score}% is built
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="text-[12px] font-bold text-crimson"
                >
                  {showAll ? "Show top 8" : `All ${criteria.length} criteria`}
                </button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {visible.map((criterion) => (
                  <div key={criterion.key}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold">
                        {criterion.label}{" "}
                        <span className="font-normal text-muted">({criterion.weight} pts)</span>
                      </span>
                      <span className="font-bold text-muted">
                        {Math.round(criterion.score * 100)}
                      </span>
                    </div>
                    <div className="meter mt-1">
                      <span style={{ width: `${Math.round(criterion.score * 100)}%` }} />
                    </div>
                    <p className="mt-1 truncate text-[11.5px] text-muted" title={criterion.note}>
                      {criterion.note}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                Only your lifestyle and home answers are scored. Deservia never scores age, family
                status, disability, religion, race, place of origin or receipt of public assistance—
                and identity details are never passed to the scorer.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
