import { useState } from "react";
import { Link } from "react-router-dom";
import type { MatchView, Recommendation } from "../../shared/types";
import { RATING_TAGS, budgetLabel, timeLabel } from "../../shared/types";
import { Avatar, EmptyState, Notice, ScoreRing, Spinner } from "../components/ui";
import { MatchCard } from "../components/MatchCard";
import { RequestCard } from "../components/RequestCard";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";
import { useAsync } from "../lib/ui";
import { ViewingScheduler } from "../components/ViewingScheduler";

type MatchesResponse = {
  mutual: MatchView[];
  incoming: MatchView[];
  outgoing: MatchView[];
  closed: MatchView[];
};

function asRecommendation(view: MatchView): Recommendation {
  return {
    other: view.other,
    listing: view.listing,
    score: view.score,
    match: {
      id: view.id,
      myAction: view.myAction,
      theirAction: view.theirAction,
      status: view.status,
    },
  };
}

function Stepper({ view }: { view: MatchView }) {
  const steps = [
    { label: "Match", done: true },
    { label: "Viewing", done: Boolean(view.viewingAt) },
    { label: "Screening", done: view.screening === "passed" },
    { label: "Lease", done: Boolean(view.acceptedAt) },
  ];
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-1.5">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold ${
              step.done
                ? "bg-gradient-to-br from-crimson to-pink text-white"
                : "bg-[#f4e7ee] text-muted"
            }`}
          >
            {step.done ? "✓" : index + 1}
          </span>
          <span
            className={`text-[11.5px] font-semibold ${step.done ? "text-ink" : "text-muted"}`}
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? <span className="mx-1 h-px w-4 bg-line" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

function LeaseCard({
  view,
  onSign,
  busy,
}: {
  view: MatchView;
  onSign: () => void;
  busy: boolean;
}) {
  const lease = view.lease;
  if (!lease) return null;
  const terms = lease.terms;
  const bothSigned = Boolean(terms.landlordSignature && terms.tenantSignature);
  const mySignature = view.iAmTenant ? terms.tenantSignature : terms.landlordSignature;

  return (
    <div className="mt-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-crimson">
            Ontario Standard Lease · demo
          </p>
          <h4 className="text-[15px] font-extrabold">{terms.unitTitle}</h4>
        </div>
        <span className="chip chip-muted">Ref {lease.reference}</span>
      </div>

      <dl className="mt-3 grid gap-x-5 gap-y-1.5 text-[13px] sm:grid-cols-2">
        <Row label="Landlord" value={terms.landlordName} />
        <Row label="Tenant" value={terms.tenantName} />
        <Row label="Rent" value={`${budgetLabel(terms.rent)}/mo`} />
        <Row label="Term" value={`${terms.term} · ${terms.startDate}`} />
        <Row label="Deposit" value={budgetLabel(terms.deposit)} />
        <Row label="Pets / smoking" value={`${terms.pets} · ${terms.smoking}`} />
      </dl>

      {terms.included.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {terms.included.map((item) => (
            <span key={item} className="chip chip-muted">
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          { side: "Tenant", value: terms.tenantSignature, mine: view.iAmTenant },
          { side: "Landlord", value: terms.landlordSignature, mine: !view.iAmTenant },
        ].map((slot) => (
          <div
            key={slot.side}
            className={`rounded-xl border px-3 py-2 text-[12px] ${
              slot.value
                ? "border-[#bfe6d4] bg-[#f2fbf7] text-[#166534]"
                : "border-dashed border-line bg-[#fffafc] text-muted"
            }`}
          >
            <p className="font-bold uppercase tracking-[0.06em]">{slot.side} signature</p>
            {slot.value ? (
              <p className="mt-0.5 break-words">{slot.value}</p>
            ) : slot.mine ? (
              <button
                type="button"
                onClick={onSign}
                disabled={busy}
                className="btn btn-primary btn-sm mt-1.5"
              >
                Sign digitally
              </button>
            ) : (
              <p className="mt-0.5">Waiting for signature</p>
            )}
          </div>
        ))}
      </div>

      {bothSigned ? (
        <p className="mt-2.5 chip-ok">✓ Signed by both sides. Copy saved to each profile.</p>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Demo document for the challenge. The official lease comes from the Ontario government;
        Deservia pre-fills it once both sides agree.
      </p>
    </div>
  );
}

function RatingForm({ view, onDone }: { view: MatchView; onDone: () => Promise<void> }) {
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tagOptions = view.iAmTenant ? RATING_TAGS.landlord : RATING_TAGS.tenant;

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/matches/${view.id}/rate`, {
        method: "POST",
        body: JSON.stringify({ stars, tags, note }),
      });
      setNote("");
      await onDone();
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (view.myRating) {
    return (
      <div className="mt-3 rounded-2xl border border-line bg-[#fffafc] p-3.5 text-[12.5px] text-muted">
        You rated this {view.iAmTenant ? "landlord" : "tenant"} {view.myRating.stars}★
        {view.myRating.note ? ` — “${view.myRating.note}”` : ""}. Ratings are about the
        transaction, never the person.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-[#fffafc] p-3.5">
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
        Rate the {view.iAmTenant ? "landlord" : "tenant"}
      </p>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStars(value)}
            className="text-2xl leading-none"
            style={{ color: value <= stars ? "#e0a800" : "#e6d9e2" }}
            aria-label={`${value} stars`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {tagOptions.map((tag) => (
          <button
            key={tag}
            type="button"
            className="opt"
            data-selected={tags.includes(tag)}
            onClick={() =>
              setTags((current) =>
                current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
              )
            }
          >
            {tag}
          </button>
        ))}
      </div>
      <textarea
        className="textarea mt-2.5"
        rows={2}
        maxLength={300}
        placeholder="Optional, short and private. Rate the experience, never who they are."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {message ? (
        <p className="mt-2 rounded-xl bg-[#fff4d6] px-3 py-2 text-[12.5px] font-semibold text-[#8a5a00]">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-sm mt-2.5"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "Submitting…" : "Submit rating"}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Written notes are checked before they post. Anything targeting a protected ground is
        blocked, and a low star average alone never removes anyone.
      </p>
    </div>
  );
}

const REPORT_REASONS = [
  "Asked me to skip screening",
  "Fake listing or photos",
  "Fake documents",
  "Harassment or threats",
  "Asked for money off-platform",
  "Something else",
];

function ReportForm({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ message: string }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({ subjectId, reason, details }),
      });
      setMessage(result.message);
      setDetails("");
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-2xl border border-line bg-white p-3.5">
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
        Private report
      </p>
      <select
        className="select mt-1.5"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      >
        {REPORT_REASONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <textarea
        className="textarea mt-2"
        rows={2}
        placeholder="What happened? This stays private and never appears on a profile."
        value={details}
        onChange={(event) => setDetails(event.target.value)}
      />
      {message ? <p className="mt-2 text-[12.5px] text-muted">{message}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function MatchPanel({
  view,
  run,
}: {
  view: MatchView;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const listing = view.listing;
  const accepted = view.status === "accepted";

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    await run(action);
    setBusy(false);
  }

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar emoji={view.other.avatar} accent={view.other.accent} size={54} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-extrabold">{view.other.name}</h3>
          <p className="truncate text-[12.5px] text-muted">
            {listing?.title} · {listing?.area} · {budgetLabel(listing?.rent ?? 0)}/mo
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {view.other.email ? `✉ ${view.other.email}` : "Contact details unlock on a mutual match"}
          </p>
        </div>
        <ScoreRing score={view.score.score} size={56} />
      </div>

      <Stepper view={view} />

      {view.application ? (
        view.iAmTenant ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[#bfe6d4] bg-[#f2fbf7] px-3.5 py-2.5">
            <p className="text-[12.5px] font-semibold text-[#166534]">
              Your rental application is ready.
            </p>
            {view.application.ready ? (
              <>
                <a
                  href={view.application.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Fill out and sign the rental application
                </a>
                <a href={view.application.downloadUrl} className="btn btn-ghost btn-sm">
                  Download PDF
                </a>
              </>
            ) : (
              <span className="text-[12px] font-semibold text-[#8a5a00]">
                The supplied form has not been added to the project yet, so it cannot be opened.
              </span>
            )}
            <span className="text-[11px] text-[#166534]/80">
              {view.application.fileName} · exactly as supplied
            </span>
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-line bg-[#fffafc] px-3.5 py-2.5 text-[12.5px] text-muted">
            Application link sent to tenant · {timeLabel(view.application.sentAt)}
          </p>
        )
      ) : null}

      {!accepted ? (
        <ViewingScheduler
          matchId={view.id}
          onChanged={async () => {
            await run(async () => undefined);
          }}
        />
      ) : null}

      {view.viewingAt && !accepted ? (
        <div className="mt-3 rounded-2xl border border-line p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
              SingleKey screening
            </p>
            <span
              className={`chip ${
                view.screening === "passed"
                  ? "chip-ok"
                  : view.screening === "flagged"
                    ? "chip-warn"
                    : "chip-muted"
              }`}
            >
              {view.screening === "passed"
                ? "Passed"
                : view.screening === "flagged"
                  ? "Flagged"
                  : "Not started"}
            </span>
          </div>

          {view.screening === "not_requested" ? (
            view.iAmTenant ? (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        api(`/api/matches/${view.id}/screening`, {
                          method: "POST",
                          body: JSON.stringify({ result: "passed" }),
                        }),
                      )
                    }
                  >
                    Run SingleKey demo check
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        api(`/api/matches/${view.id}/screening`, {
                          method: "POST",
                          body: JSON.stringify({ result: "flagged" }),
                        }),
                      )
                    }
                  >
                    Simulate a flag
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                  Demo stand-in. Real job, income and credit checks stay with SingleKey; Deservia
                  stores only the result, never the report.
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[13px] text-muted">
                Waiting for the tenant to complete screening.
              </p>
            )
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{view.screeningNote}</p>
          )}

          {view.screening === "passed" && !accepted ? (
            view.iAmTenant ? (
              <p className="mt-2 text-[12.5px] font-semibold text-muted">
                Waiting for the landlord&apos;s decision. Deservia suggests — they choose.
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm mt-2.5"
                disabled={busy}
                onClick={() =>
                  void perform(() =>
                    api(`/api/matches/${view.id}/accept`, { method: "POST" }),
                  )
                }
              >
                Accept tenant &amp; generate lease
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {accepted && view.lease ? (
        <>
          <LeaseCard
            view={view}
            busy={busy}
            onSign={() =>
              void perform(() => api(`/api/matches/${view.id}/sign`, { method: "POST" }))
            }
          />
          <RatingForm
            view={view}
            onDone={async () => {
              await run(async () => undefined);
            }}
          />
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {!accepted ? (
          <button
            type="button"
            className="text-[12px] font-semibold text-muted hover:text-crimson"
            onClick={() =>
              void perform(() =>
                api(`/api/matches/${view.id}/withdraw`, { method: "POST" }),
              )
            }
          >
            Withdraw from this match
          </button>
        ) : null}
        <button
          type="button"
          className="ml-auto text-[12px] font-semibold text-muted hover:text-crimson"
          onClick={() => setShowReport((value) => !value)}
        >
          Report a concern
        </button>
      </div>
      {showReport ? (
        <ReportForm subjectId={view.other.id} onClose={() => setShowReport(false)} />
      ) : null}
    </article>
  );
}

export default function Matches() {
  const { session, refresh } = useSession();
  const profile = session!.profile;
  const { data, loading, error: loadError, reload } = useAsync<MatchesResponse>(
    () => api<MatchesResponse>("/api/matches"),
    [profile.id],
  );
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      await reload();
      await refresh();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }

  async function onInterest(profileId: string, action: "like" | "pass") {
    await api("/api/interest", {
      method: "POST",
      body: JSON.stringify({ profileId, action }),
    });
    await reload();
    await refresh();
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Loading your matches…" />
      </div>
    );
  }
  if (loadError) return <Notice tone="warn">{loadError}</Notice>;

  const mutual = data?.mutual ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const closed = data?.closed ?? [];
  const role = profile.role === "landlord" ? "landlord" : "tenant";
  const isEmpty = !mutual.length && !incoming.length && !outgoing.length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Conversations</div>
          <h1 className="section-title mt-1.5">Matches</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            A mutual match unlocks contact details, the rental application and the viewing calendar.
            A request only becomes mutual when the landlord accepts it.
          </p>
        </div>
        <Link to={role === "landlord" ? "/app/requests" : "/app/deck"} className="btn btn-ghost btn-sm">
          {role === "landlord" ? "Back to requests" : "Back to the deck"}
        </Link>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="mt-6">
          <EmptyState emoji="💜" title="No conversations yet">
            Like a match on Discover. When they like you back, it lands here and you can book a
            viewing.
          </EmptyState>
        </div>
      ) : null}

      {mutual.length ? (
        <section className="mt-7">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Mutual matches · {mutual.length}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {mutual.map((view) => (
              <MatchPanel key={view.id} view={view} run={run} />
            ))}
          </div>
        </section>
      ) : null}

      {incoming.length ? (
        <section className="mt-8">
          <h2 className="mb-1 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Requests waiting for you · {incoming.length}
          </h2>
          <p className="mb-3 text-[12.5px] text-muted">
            Tenants who asked to rent your listing. Accept to unlock their application and viewing
            schedule, or decline to close the request.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {incoming.map((view) => (
              <RequestCard
                key={view.id}
                view={view}
                onDecision={async (matchId, decision) => {
                  await run(() =>
                    api(`/api/matches/${matchId}/request`, {
                      method: "POST",
                      body: JSON.stringify({ decision }),
                    }),
                  );
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {outgoing.length ? (
        <section className="mt-8">
          <h2 className="mb-1 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Waiting on them · {outgoing.length}
          </h2>
          <p className="mb-3 text-[12.5px] text-muted">
            Your requests are with the landlord. You can withdraw until they answer.
          </p>
          <div className="space-y-3">
            {outgoing.map((view, index) => (
              <MatchCard
                key={view.id}
                item={asRecommendation(view)}
                rank={index + 1}
                role={role}
                onInterest={onInterest}
              />
            ))}
          </div>
        </section>
      ) : null}

      {closed.length ? (
        <section className="mt-8">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Closed
          </h2>
          <div className="card divide-y divide-line/70">
            {closed.map((view) => (
              <div key={view.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar emoji={view.other.avatar} accent={view.other.accent} size={30} />
                <span className="text-[13px] font-semibold">{view.other.name}</span>
                <span className="ml-auto text-[12px] capitalize text-muted">{view.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
