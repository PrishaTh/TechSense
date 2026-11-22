import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { Listing, MatchView } from "../../shared/types";
import { EmptyState, Notice, Spinner } from "../components/ui";
import { RequestCard } from "../components/RequestCard";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";
import { useAsync } from "../lib/ui";

type RequestsResponse = {
  listing: Listing | null;
  listings: Listing[];
  requests: MatchView[];
  pending: number;
};

export default function Requests() {
  const { session, refresh } = useSession();
  const profile = session!.profile;
  const [listingId, setListingId] = useState<string>("");
  const [compare, setCompare] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useAsync<RequestsResponse>(
    () =>
      api<RequestsResponse>(
        `/api/requests${listingId ? `?listingId=${encodeURIComponent(listingId)}` : ""}`,
      ),
    [profile.id, listingId],
  );

  useEffect(() => {
    setCompare([]);
  }, [data?.listing?.id]);

  async function decide(matchId: string, decision: "accept" | "decline") {
    setError(null);
    try {
      await api(`/api/matches/${matchId}/request`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      await reload();
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (!profile || profile.role !== "landlord") {
    return <Navigate to="/app/deck" replace />;
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Loading requests…" />
      </div>
    );
  }
  if (loadError) return <Notice tone="warn">{loadError}</Notice>;

  if (!data?.listing) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState emoji="🏡" title="Add your listing first">
          Tenants can only request a listing that exists. Your first listing is free for 30 days.{" "}
          <Link to="/app/listing/new" className="font-bold text-crimson">
            Create your listing →
          </Link>
        </EmptyState>
      </div>
    );
  }

  const listing = data.listing;
  const requests = data.requests ?? [];
  const pending = requests.filter((view) => view.status === "requested");
  const answered = requests.filter((view) => view.status !== "requested");

  function compareHref(): string {
    const [a, b] = compare;
    return `/app/compare?a=${encodeURIComponent(a ?? "")}&b=${encodeURIComponent(
      b ?? "",
    )}&listing=${encodeURIComponent(listing.id)}`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Match requests</div>
          <h1 className="section-title mt-1.5">Requests for your listing</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Only tenants who liked your listing appear here. Accept to make it mutual and unlock the
            rental application and viewing schedule for both of you; decline to close it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-warn">{data.pending} pending</span>
          <Link to="/app/listings" className="btn btn-ghost btn-sm">
            My listings
          </Link>
        </div>
      </div>

      {(data.listings ?? []).length > 1 ? (
        <label className="mt-4 block max-w-sm">
          <span className="field-label">Listing</span>
          <select
            className="select"
            value={listing.id}
            onChange={(event) => setListingId(event.target.value)}
          >
            {(data.listings ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title} · {entry.area}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 text-[12.5px]">
        <span className="font-bold">{listing.title}</span>
        <span className="text-muted">· {listing.area}</span>
        {listing.address ? <span className="text-muted">· {listing.address}</span> : null}
        <Link
          to="/app/matches"
          className="ml-auto text-[12px] font-bold text-crimson underline decoration-crimson/30 underline-offset-2"
        >
          My matches
        </Link>
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      {compare.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5">
          <span className="text-[12px] font-semibold">
            {compare.length} of 2 requests selected
          </span>
          <Link
            to={compareHref()}
            className={`btn btn-primary btn-sm ml-auto ${
              compare.length < 2 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Compare tenants
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

      {pending.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {pending.map((view) => (
            <RequestCard
              key={view.id}
              view={view}
              onDecision={decide}
              compareSelected={compare.includes(view.other.id)}
              compareDisabled={compare.length >= 2}
              onCompareChange={(checked) =>
                setCompare((current) =>
                  checked
                    ? [...current.filter((entry) => entry !== view.other.id), view.other.id].slice(-2)
                    : current.filter((entry) => entry !== view.other.id),
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState emoji="📬" title="No requests yet">
            No requests yet; tenants who like this listing will appear here.
          </EmptyState>
        </div>
      )}

      {answered.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Accepted · {answered.length}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {answered.map((view) => (
              <RequestCard
                key={view.id}
                view={view}
                onDecision={decide}
                compareSelected={compare.includes(view.other.id)}
                compareDisabled={compare.length >= 2}
                onCompareChange={(checked) =>
                  setCompare((current) =>
                    checked
                      ? [...current.filter((entry) => entry !== view.other.id), view.other.id].slice(-2)
                      : current.filter((entry) => entry !== view.other.id),
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
