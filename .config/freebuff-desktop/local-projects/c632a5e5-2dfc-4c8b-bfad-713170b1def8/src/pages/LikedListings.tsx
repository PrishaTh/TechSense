import { Link } from "react-router-dom";
import type { Listing, Recommendation } from "../../shared/types";
import { bedroomLabel, budgetLabel, washroomLabel } from "../../shared/types";
import { EmptyState, Notice, ScoreRing, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useChat } from "../lib/chat";
import { useSession } from "../lib/session";
import { accentStyle, useAsync } from "../lib/ui";

type LikedResponse = { items: Recommendation[] };

export default function LikedListings() {
  const { session } = useSession();
  const profile = session!.profile;
  const { data, loading, error } = useAsync<LikedResponse>(
    () => api<LikedResponse>("/api/liked"),
    [profile.id],
  );
  const { attachListing, attachment, busy } = useChat();
  const items = data?.items ?? [];

  if (profile.role !== "tenant") {
    return <Notice tone="warn">Liked listings are for tenant accounts.</Notice>;
  }

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Loading the listings you liked…" />
      </div>
    );
  }
  if (error) return <Notice tone="warn">{error}</Notice>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Requests sent</div>
          <h1 className="section-title mt-1.5">Requested listings</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Every listing you asked to rent, and where the landlord's answer stands. Open the
            assistant on any card to ask about it — the listing details are fetched fresh from the
            server.
          </p>
        </div>
        <Link to="/app/deck" className="btn btn-ghost btn-sm">
          Back to the deck
        </Link>
      </div>

      {!items.length ? (
        <div className="mt-6">
          <EmptyState emoji="🤍" title="No requests yet">
            Like a listing in your deck and it will appear here with its own assistant button. The
            landlord accepts or declines each request.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const listing = item.listing as Listing;
            const attached = attachment?.id === listing.id;
            const mutual =
              item.match?.status === "mutual" || item.match?.status === "accepted";
            return (
              <article key={listing.id} className="card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl"
                    style={accentStyle(listing.accent)}
                  >
                    {listing.emoji || "🏡"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {mutual ? (
                        <span className="chip chip-ok">Mutual match</span>
                      ) : (
                        <span className="chip chip-warn">Waiting on the landlord</span>
                      )}
                      {item.match?.theirAction === "like" && !mutual ? (
                        <span className="chip chip-warn">Liked you back</span>
                      ) : null}
                    </div>
                    <h2 className="truncate text-[16px] font-extrabold">{listing.title}</h2>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {listing.area} · {budgetLabel(listing.rent)}/mo ·{" "}
                      {bedroomLabel(listing.bedrooms)} · {washroomLabel(listing.washrooms)}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      Hosted by {item.other.name}
                    </p>
                  </div>
                  <ScoreRing score={item.score.score} size={52} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    className={`btn btn-sm ${attached ? "btn-ghost" : "btn-primary"}`}
                    disabled={busy}
                    onClick={() => void attachListing(listing.id)}
                  >
                    {attached ? "Attached" : "Ask the chatbot"}
                  </button>
                  <Link to="/app/matches" className="btn btn-ghost btn-sm">
                    My matches
                  </Link>
                  <Link
                    to={`/app/compare?a=${listing.id}`}
                    className="ml-auto text-[12px] font-bold text-crimson underline decoration-crimson/30 underline-offset-2"
                  >
                    Compare
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
