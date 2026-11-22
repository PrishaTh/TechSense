import { useState } from "react";
import { Link } from "react-router-dom";
import type { MatchView } from "../../shared/types";
import { bedroomLabel, budgetLabel, hobbyLabel, label, timeLabel } from "../../shared/types";
import { errorMessage } from "../lib/api";
import { Avatar, ScoreRing } from "./ui";

/**
 * A tenant's request to rent one listing. Landlords can only ever see tenants
 * who sent a request; there is no browsing, liking or swiping here.
 */
export function RequestCard({
  view,
  onDecision,
  compareSelected = false,
  compareDisabled = false,
  onCompareChange,
}: {
  view: MatchView;
  onDecision: (matchId: string, decision: "accept" | "decline") => Promise<void>;
  compareSelected?: boolean;
  compareDisabled?: boolean;
  onCompareChange?: (checked: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tenant = view.other;
  const home = tenant.home;
  const pending = view.status === "requested";

  const tags = [
    label("tidiness", tenant.lifestyle.tidiness),
    label("schedule", tenant.lifestyle.schedule),
    label("chronotype", tenant.lifestyle.chronotype),
    label("social", tenant.lifestyle.social),
    label("music", tenant.lifestyle.music),
    label("pets", tenant.lifestyle.pets),
    ...(tenant.lifestyle.hobbies ?? []).slice(0, 2).map(hobbyLabel),
  ];

  const reasons = view.score.commonalities.slice(0, 3);
  if (reasons.length < 3) {
    for (const criterion of [...view.score.criteria].sort((a, b) => b.weight - a.weight)) {
      if (reasons.length >= 3) break;
      if (criterion.score >= 0.8 && !reasons.includes(criterion.note)) reasons.push(criterion.note);
    }
  }

  async function answer(decision: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      await onDecision(view.id, decision);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex gap-3.5 sm:gap-4">
        <Avatar emoji={tenant.avatar} accent={tenant.accent} size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-crimson">
                  Request · {timeLabel(view.createdAt)}
                </span>
                {view.status === "mutual" ? <span className="chip chip-ok">Accepted</span> : null}
                {view.status === "accepted" ? <span className="chip chip-ok">Match accepted</span> : null}
              </div>
              <h3 className="truncate text-[17px] font-extrabold">{tenant.name}</h3>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {tenant.tagline}
                {home
                  ? ` · ${budgetLabel(home.budget)}/mo · ${home.area} · ${bedroomLabel(
                      home.bedrooms,
                    )} · ${label("lease", home.lease)} lease`
                  : ""}
              </p>
              <p className="mt-1 truncate text-[12.5px] text-muted">
                {view.listing?.title} · {view.listing?.area}
              </p>
            </div>
            <ScoreRing score={view.score.score} size={62} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...new Set(tags)].slice(0, 7).map((tag) => (
              <span key={tag} className="chip chip-muted">
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-3">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
              Top reasons they matched
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {reasons.map((reason) => (
                <span key={reason} className="chip chip-ok">
                  ✓ {reason}
                </span>
              ))}
            </div>
          </div>

          {tenant.expectations ? (
            <p className="mt-3 line-clamp-2 rounded-xl border border-line bg-[#fffafc] px-3 py-2 text-[12.5px] text-muted">
              “{tenant.expectations}”
            </p>
          ) : null}

          {error ? <p className="mt-2 text-[12.5px] font-semibold text-crimson">{error}</p> : null}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {pending ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void answer("accept")}
                >
                  {busy ? "Saving…" : "Accept"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void answer("decline")}
                >
                  Decline
                </button>
              </>
            ) : (
              <Link to="/app/matches" className="btn btn-primary btn-sm">
                Open match
              </Link>
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
          </div>
        </div>
      </div>
    </article>
  );
}
