import { useState } from "react";
import type { ScoreResult } from "../../shared/types";
import { budgetLabel } from "../../shared/types";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { Notice, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAsync } from "../lib/ui";

type AdminMatch = {
  id: string;
  tenantName: string;
  landlordName: string;
  listingTitle: string;
  percent: number;
  score: ScoreResult | null;
  status: string;
  createdAt: string;
  snapshotAt: string | null;
};

type Dashboard = {
  stats: {
    tenants: number;
    landlords: number;
    admins: number;
    activeListings: number;
    pausedListings: number;
    leasedListings: number;
    likes: number;
    passes: number;
    mutual: number;
    likeToMatchRate: number;
    pairs: number;
  };
  distribution: { label: string; count: number }[];
  goodFit: {
    target: string;
    tenants: number;
    meeting: number;
    noGreatFit: { id: string; name: string }[];
  };
  fairness: { checksRun: number; failures: number; checks: string[] };
  weights: { key: string; label: string; weight: number; kind: string }[];
  notes: {
    version: string;
    scored: string[];
    neverScored: string[];
    rules: string[];
  };
  recentMatches: AdminMatch[];
};

type Report = {
  id: string;
  reporterName: string;
  subjectName: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
};

type User = {
  id: string;
  role: string;
  name: string;
  email: string;
  status: string;
  demo: boolean;
  consentAt: string | null;
  createdAt: string;
};

type Listing = {
  id: string;
  landlordId: string;
  landlordName: string;
  title: string;
  rent: number;
  area: string;
  spaceType: string;
  paused: boolean;
  leased: boolean;
};

type UserDetail = {
  profile: {
    id: string;
    name: string;
    email: string;
    role: string;
    tagline: string;
    lifestyle: Record<string, unknown>;
    home: Record<string, unknown> | null;
    expectations: string;
    excluded: string[];
  };
  listing: Listing | null;
  trust: { average: number | null; count: number };
  consentAt: string | null;
  status: string;
};

type DataRequest = {
  id: string;
  profileName: string;
  profileEmail: string;
  kind: string;
  note: string;
  status: string;
  createdAt: string;
};

type AuditEntry = {
  id: string;
  adminName: string;
  action: string;
  targetId: string | null;
  detail: string;
  createdAt: string;
};

const tabs = [
  { id: "overview", label: "Dashboard" },
  { id: "matches", label: "All matches" },
  { id: "users", label: "Users & listings" },
  { id: "reports", label: "Reports" },
  { id: "fairness", label: "Scoring & fairness" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-0.5 text-[24px] font-extrabold leading-tight">{value}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<UserDetail | null>(null);

  const dashboard = useAsync(() => api<Dashboard>("/api/admin/dashboard"), []);
  const matches = useAsync(() => api<{ matches: AdminMatch[] }>("/api/admin/matches"), []);
  const users = useAsync(
    () => api<{ users: User[]; listings: Listing[] }>(`/api/admin/users?q=${encodeURIComponent(search)}`),
    [search],
  );
  const reports = useAsync(() => api<{ reports: Report[] }>("/api/admin/reports"), []);
  const requests = useAsync(() => api<{ requests: DataRequest[] }>("/api/admin/data-requests"), []);
  const audit = useAsync(() => api<{ entries: AuditEntry[] }>("/api/admin/audit"), []);

  async function run(key: string, action: () => Promise<unknown>, note?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage(note ?? "Done.");
      dashboard.reload();
      matches.reload();
      users.reload();
      reports.reload();
      requests.reload();
      audit.reload();
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function viewUser(userId: string) {
    setBusy(`view-${userId}`);
    setMessage(null);
    try {
      const result = await api<UserDetail>(`/api/admin/users/${userId}/view`, { method: "POST" });
      setDetail(result);
      audit.reload();
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function exportNumbers() {
    if (!dashboard.data) return;
    const blob = new Blob([JSON.stringify(dashboard.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "deservia-oversight.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const stats = dashboard.data?.stats;
  const maxBucket = Math.max(1, ...(dashboard.data?.distribution ?? []).map((row) => row.count));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Deservia internal</div>
          <h1 className="section-title mt-1.5">Oversight</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Aggregate only: admin accounts never swipe, match or change one person&apos;s score.
            They watch whether matching performs, handle reports and appeals, and care for users
            and listings.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={exportNumbers}>
          Export numbers
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="opt"
            data-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="mt-4">
          <Notice tone="ok">{message}</Notice>
        </div>
      ) : null}

      {tab === "overview" ? (
        <section className="mt-5">
          {dashboard.loading ? <Spinner label="Loading the dashboard…" /> : null}
          {dashboard.error ? <Notice tone="warn">{dashboard.error}</Notice> : null}

          {dashboard.data && stats ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label="Accounts"
                  value={`${stats.tenants + stats.landlords}`}
                  hint={`${stats.tenants} tenants · ${stats.landlords} landlords · ${stats.admins} admins`}
                />
                <Kpi
                  label="Active listings"
                  value={stats.activeListings}
                  hint={`${stats.pausedListings} paused · ${stats.leasedListings} leased`}
                />
                <Kpi
                  label="Likes / passes"
                  value={`${stats.likes} / ${stats.passes}`}
                  hint="Across every tenant–landlord pair"
                />
                <Kpi
                  label="Mutual matches"
                  value={stats.mutual}
                  hint={`${stats.likeToMatchRate}% like-to-match rate`}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="card p-5">
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                    Score distribution
                  </h2>
                  <p className="mt-1 text-[11.5px] text-muted">
                    All {stats.pairs} active tenant × listing pairs.
                  </p>
                  <div className="mt-3 space-y-2">
                    {dashboard.data.distribution.map((row) => (
                      <div key={row.label}>
                        <div className="flex justify-between text-[12px]">
                          <span className="font-semibold">{row.label}%</span>
                          <span className="text-muted">{row.count}</span>
                        </div>
                        <div className="meter mt-1">
                          <span style={{ width: `${(row.count / maxBucket) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="card p-5">
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                      Good-fit target
                    </h2>
                    <p className="mt-1 text-[12px] text-muted">{dashboard.data.goodFit.target}</p>
                    <p className="mt-2 text-[24px] font-extrabold">
                      {dashboard.data.goodFit.meeting}
                      <span className="text-[15px] font-semibold text-muted">
                        {" "}
                        / {dashboard.data.goodFit.tenants} tenants
                      </span>
                    </p>
                    {dashboard.data.goodFit.noGreatFit.length ? (
                      <div className="mt-2 rounded-xl border border-[#f1d58a] bg-[#fff7e6] p-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#8a5a00]">
                          No great fits in their top 10
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#8a5a00]">
                          {dashboard.data.goodFit.noGreatFit.map((entry) => entry.name).join(", ")}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] text-ok">
                        Every tenant has at least one great fit.
                      </p>
                    )}
                  </div>

                  <div className="card p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                        Fairness checks
                      </h2>
                      <span
                        className={`chip ${
                          dashboard.data.fairness.failures === 0 ? "chip-ok" : "chip-warn"
                        }`}
                      >
                        {dashboard.data.fairness.failures} failures
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {dashboard.data.fairness.checksRun} checks run this view.
                    </p>
                    <ul className="mt-2 space-y-1 text-[12px] text-muted">
                      {dashboard.data.fairness.checks.map((check) => (
                        <li key={check}>• {check}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="card mt-4 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                    Recent mutual matches
                  </h2>
                  <button
                    type="button"
                    className="text-[12px] font-bold text-crimson"
                    onClick={() => setTab("matches")}
                  >
                    See all matches →
                  </button>
                </div>
                {dashboard.data.recentMatches.length ? (
                  <div className="mt-2 divide-y divide-line/70">
                    {dashboard.data.recentMatches.map((match) => (
                      <div key={match.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="text-[13px] font-bold">{match.tenantName}</span>
                        <span className="text-[12px] text-muted">↔</span>
                        <span className="text-[13px] font-bold">{match.landlordName}</span>
                        <span className="truncate text-[12px] text-muted">
                          · {match.listingTitle}
                        </span>
                        <span className="ml-auto chip chip-ok">{match.percent}%</span>
                        <span className="text-[11.5px] capitalize text-muted">{match.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[12.5px] text-muted">No mutual matches yet.</p>
                )}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "matches" ? (
        <section className="mt-5">
          {matches.loading ? <Spinner label="Loading every match…" /> : null}
          {matches.error ? <Notice tone="warn">{matches.error}</Notice> : null}

          <div className="space-y-2.5">
            {(matches.data?.matches ?? []).map((match) => (
              <article key={match.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold">
                      {match.tenantName} ↔ {match.landlordName}
                    </p>
                    <p className="text-[12px] text-muted">
                      {match.listingTitle} · {stamp(match.createdAt)}
                      {match.snapshotAt ? ` · snapshot ${stamp(match.snapshotAt)}` : ""}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="chip chip-muted capitalize">{match.status}</span>
                    <span className="chip">{match.percent}%</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setOpenMatch((current) => (current === match.id ? null : match.id))
                      }
                      disabled={!match.score}
                    >
                      {openMatch === match.id ? "Hide breakdown" : "Open breakdown"}
                    </button>
                  </div>
                </div>
                {openMatch === match.id && match.score ? (
                  <div className="mt-3 rounded-2xl border border-line bg-[#fffafc] p-3.5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                      Read-only score {match.snapshotAt ? "as it was when the match happened" : "recalculated"}
                    </p>
                    <ScoreBreakdown score={match.score} readOnly />
                  </div>
                ) : null}
              </article>
            ))}
            {matches.data && !matches.data.matches.length ? (
              <Notice>No matches yet.</Notice>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="mt-5">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <input
              className="input max-w-sm !py-2"
              placeholder="Search names, emails or listings"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search users and listings"
            />
            <button type="submit" className="btn btn-primary btn-sm">
              Search
            </button>
            {search ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
              >
                Clear
              </button>
            ) : null}
            <span className="text-[11.5px] text-muted">
              Every profile view is written to the audit log.
            </span>
          </form>

          {users.loading ? <Spinner label="Loading accounts…" /> : null}
          {users.error ? <Notice tone="warn">{users.error}</Notice> : null}

          {users.data ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="card overflow-hidden">
                <h2 className="border-b border-line px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                  Accounts · {users.data.users.length}
                </h2>
                <div className="divide-y divide-line/70">
                  {users.data.users.map((user) => (
                    <div key={user.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold">
                          {user.name}{" "}
                          {user.demo ? <span className="chip chip-muted">demo</span> : null}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {user.email} · {user.role} · joined {stamp(user.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`chip ${
                          user.status === "active" ? "chip-ok" : "chip-warn"
                        }`}
                      >
                        {user.status}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy === `view-${user.id}`}
                        onClick={() => void viewUser(user.id)}
                      >
                        View
                      </button>
                      {user.role !== "admin" ? (
                        <button
                          type="button"
                          className="text-[11.5px] font-bold text-crimson"
                          disabled={busy === `sus-${user.id}`}
                          onClick={() =>
                            void run(
                              `sus-${user.id}`,
                              () =>
                                api(`/api/admin/users/${user.id}/suspend`, {
                                  method: "POST",
                                  body: JSON.stringify({ suspended: user.status === "active" }),
                                }),
                              user.status === "active"
                                ? "Account suspended. It can appeal for free."
                                : "Account reinstated.",
                            )
                          }
                        >
                          {user.status === "active" ? "Suspend" : "Reinstate"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {detail ? (
                  <div className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-extrabold">{detail.profile.name}</p>
                        <p className="text-[11.5px] text-muted">
                          {detail.profile.email} · {detail.profile.role} · {detail.status}
                        </p>
                        <p className="text-[11px] text-muted">
                          Consent recorded{" "}
                          {detail.consentAt ? stamp(detail.consentAt) : "not recorded"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-[11.5px] font-bold text-muted"
                        onClick={() => setDetail(null)}
                      >
                        Close
                      </button>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted">
                      {detail.profile.expectations || detail.profile.tagline}
                    </p>
                    {detail.profile.home ? (
                      <p className="mt-1 text-[12px] text-muted">
                        {String(detail.profile.home.area ?? "")} ·{" "}
                        {budgetLabel(Number(detail.profile.home.budget ?? 0))}/mo
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(detail.profile.lifestyle)
                        .filter(([, value]) => typeof value === "string")
                        .slice(0, 8)
                        .map(([key, value]) => (
                          <span key={key} className="chip chip-muted">
                            {key}: {String(value)}
                          </span>
                        ))}
                    </div>
                    {detail.listing ? (
                      <p className="mt-3 rounded-xl border border-line bg-[#fffafc] p-2.5 text-[12px]">
                        <strong>{detail.listing.title}</strong> · {budgetLabel(detail.listing.rent)}
                        /mo · {detail.listing.area}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-muted">
                      Passwords, card or bank details and credit reports are never shown here.
                    </p>
                  </div>
                ) : null}

                <div className="card overflow-hidden">
                  <h2 className="border-b border-line px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                    Listings · {users.data.listings.length}
                  </h2>
                  <div className="divide-y divide-line/70">
                    {users.data.listings.map((listing) => (
                      <div key={listing.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-bold">{listing.title}</p>
                          <p className="text-[11px] text-muted">
                            {listing.landlordName} · {listing.area} · {budgetLabel(listing.rent)}
                            /mo
                          </p>
                        </div>
                        <span className="chip chip-muted">
                          {listing.leased ? "leased" : listing.paused ? "paused" : "live"}
                        </span>
                        <button
                          type="button"
                          className="text-[11.5px] font-bold text-crimson"
                          onClick={() =>
                            void run(
                              `listing-${listing.id}`,
                              () =>
                                api(`/api/admin/listings/${listing.id}/state`, {
                                  method: "POST",
                                  body: JSON.stringify({ paused: !listing.paused }),
                                }),
                              listing.paused ? "Listing resumed." : "Listing paused.",
                            )
                          }
                        >
                          {listing.paused ? "Resume" : "Pause"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Data access &amp; deletion requests
              </h2>
              <div className="mt-2 space-y-2">
                {(requests.data?.requests ?? []).map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-line bg-[#fffafc] p-2.5"
                  >
                    <p className="text-[12.5px] font-bold">
                      {request.profileName} · {request.kind === "delete" ? "delete" : "export"}
                      <span className="ml-2 chip chip-muted">{request.status}</span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">{request.note}</p>
                    {request.status === "open" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm mt-1.5"
                        onClick={() =>
                          void run(
                            `req-${request.id}`,
                            () =>
                              api(`/api/admin/data-requests/${request.id}/resolve`, {
                                method: "POST",
                              }),
                            "Request marked handled.",
                          )
                        }
                      >
                        Mark handled
                      </button>
                    ) : null}
                  </div>
                ))}
                {requests.data && !requests.data.requests.length ? (
                  <p className="text-[12px] text-muted">No open requests.</p>
                ) : null}
              </div>
            </div>

            <div className="card p-4">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Admin audit log
              </h2>
              <div className="mt-2 max-h-[240px] space-y-1.5 overflow-y-auto">
                {(audit.data?.entries ?? []).map((entry) => (
                  <p key={entry.id} className="text-[11.5px] text-muted">
                    <span className="font-semibold text-ink">{entry.adminName}</span>{" "}
                    {entry.action.replace(/_/g, " ")}
                    {entry.detail ? ` · ${entry.detail}` : ""} · {stamp(entry.createdAt)}
                  </p>
                ))}
                {audit.data && !audit.data.entries.length ? (
                  <p className="text-[12px] text-muted">No admin activity yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="mt-5">
          {reports.loading ? <Spinner label="Loading reports…" /> : null}
          {reports.error ? <Notice tone="warn">{reports.error}</Notice> : null}
          <div className="space-y-3">
            {(reports.data?.reports ?? []).map((report) => (
              <article key={report.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-extrabold">{report.reason}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {report.reporterName} → {report.subjectName} · {stamp(report.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`chip ${
                      report.status === "open"
                        ? "chip-warn"
                        : report.status === "removed"
                          ? "chip"
                          : "chip-ok"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>
                {report.details ? (
                  <p className="mt-2 rounded-xl border border-line bg-[#fffafc] p-3 text-[13px] leading-relaxed">
                    {report.details}
                  </p>
                ) : null}
                {report.status === "open" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy === report.id}
                      onClick={() =>
                        void run(
                          report.id,
                          () =>
                            api(`/api/admin/reports/${report.id}/resolve`, {
                              method: "POST",
                              body: JSON.stringify({ action: "dismiss" }),
                            }),
                          "Report reviewed — no further action.",
                        )
                      }
                    >
                      Review — no action
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy === report.id}
                      onClick={() =>
                        void run(
                          report.id,
                          () =>
                            api(`/api/admin/reports/${report.id}/resolve`, {
                              method: "POST",
                              body: JSON.stringify({ action: "remove" }),
                            }),
                          "Conduct breach confirmed. The account can appeal for free.",
                        )
                      }
                    >
                      Remove account (conduct)
                    </button>
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Removal is for conduct only — fraud, fake documents, threats or skipping
                  screening. Every removal can be appealed free of charge to this team.
                </p>
              </article>
            ))}
            {reports.data && !reports.data.reports.length ? (
              <Notice>No reports yet. Reports stay private and never appear on a profile.</Notice>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "fairness" ? (
        <section className="mt-5">
          {dashboard.loading ? <Spinner label="Loading the audit…" /> : null}
          {dashboard.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-5">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                  Scored inputs
                </h2>
                <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                  {dashboard.data.notes.scored.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <h2 className="mt-4 text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                  Never scored
                </h2>
                <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                  {dashboard.data.notes.neverScored.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="card p-5">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                  Published weights
                </h2>
                <p className="mt-1 text-[11.5px] text-muted">
                  Score version {dashboard.data.notes.version}. View only — a change needs the owner
                  and a lawyer to sign off, and protected grounds can never be added.
                </p>
                <div className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
                  {dashboard.data.weights.map((weight) => (
                    <div key={weight.key} className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px]">{weight.label}</span>
                      <span className="text-[12px] font-bold text-muted">{weight.weight}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5 lg:col-span-2">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                  Design rules
                </h2>
                <ol className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">
                  {dashboard.data.notes.rules.map((rule, index) => (
                    <li key={rule}>
                      <span className="font-bold text-ink">{index + 1}.</span> {rule}
                    </li>
                  ))}
                </ol>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-[#fffafc] p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
                      Checks run
                    </p>
                    <p className="text-[19px] font-extrabold">
                      {dashboard.data.fairness.checksRun}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-[#fffafc] p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
                      Failures
                    </p>
                    <p className="text-[19px] font-extrabold">
                      {dashboard.data.fairness.failures}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-[#fffafc] p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
                      Pairs scored
                    </p>
                    <p className="text-[19px] font-extrabold">{dashboard.data.stats.pairs}</p>
                  </div>
                </div>
                <p className="mt-3 rounded-xl border border-[#f1d58a] bg-[#fff7e6] p-3 text-[12px] leading-relaxed text-[#8a5a00]">
                  Brokerage agents can be given a read-only version of the dashboard and matches.
                  Admins cannot act as a user, swipe, or edit an individual score.
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
