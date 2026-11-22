import { Link } from "react-router-dom";
import { bedroomLabel, budgetLabel } from "../../shared/types";
import { EmptyState } from "../components/ui";
import { useSession } from "../lib/session";

export default function MyListings() {
  const { session } = useSession();
  const listings = session?.listings ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Landlord</div>
          <h1 className="section-title mt-1.5">My listings</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Every place you have added. Each one keeps its own requests and its own place in the
            tenant decks.
          </p>
        </div>
        <Link to="/app/listing/new" className="btn btn-primary">
          + Add new listing
        </Link>
      </div>

      {listings.length ? (
        <div className="mt-5 space-y-3">
          {listings.map((listing) => (
            <article key={listing.id} className="card flex flex-wrap items-center gap-3 p-4">
              {listing.photos?.[0] ? (
                <img
                  src={listing.photos[0]}
                  alt={listing.title}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-blush text-2xl">
                  {listing.emoji || "🏡"}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold">{listing.title}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  {listing.address ?? "No street address"}
                  {listing.unit ? `, ${listing.unit}` : ""} · {listing.area}
                  {listing.postalCode ? ` ${listing.postalCode}` : ""}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {bedroomLabel(listing.bedrooms)} · {budgetLabel(listing.rent)}/mo
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {listing.leased ? (
                    <span className="chip">Leased</span>
                  ) : listing.paused ? (
                    <span className="chip chip-warn">Paused</span>
                  ) : (
                    <span className="chip chip-ok">Live in tenant decks</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link to={`/app/listing/${listing.id}`} className="btn btn-ghost btn-sm">
                  Edit
                </Link>
                <Link to="/app/requests" className="btn btn-ghost btn-sm">
                  Requests
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState emoji="🏡" title="No listings yet">
            Add your first place to start receiving tenant requests.{" "}
            <Link to="/app/listing/new" className="font-bold text-crimson">
              Add new listing →
            </Link>
          </EmptyState>
        </div>
      )}
    </div>
  );
}
