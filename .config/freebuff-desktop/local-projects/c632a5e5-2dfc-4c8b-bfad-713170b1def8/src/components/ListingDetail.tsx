import type { Listing } from "../../shared/types";
import { bedroomLabel, budgetLabel, label, washroomLabel } from "../../shared/types";
import { accentStyle } from "../lib/ui";

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-muted">{name}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

export function ListingDetail({
  listing,
  landlordName,
  onClose,
}: {
  listing: Listing;
  landlordName?: string;
  onClose: () => void;
}) {
  const amenityWords = listing.amenities;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-lift">
        <div
          className="relative flex h-32 items-center gap-4 px-5 text-white"
          style={accentStyle(listing.accent)}
        >
          <span className="text-5xl" aria-hidden>
            {listing.emoji || "🏡"}
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/80">
              {landlordName ? `Listed by ${landlordName}` : "Listing"}
            </p>
            <h2 className="text-[21px] font-extrabold leading-tight">{listing.title}</h2>
            <p className="text-[13px] text-white/85">
              {listing.area} · {budgetLabel(listing.rent)}/mo ·{" "}
              {label("spaceType", listing.spaceType)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
            aria-label="Close listing details"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <p className="text-[13.5px] leading-relaxed text-muted">{listing.blurb}</p>

          <dl className="mt-4 grid gap-x-5 gap-y-1.5 text-[13px] sm:grid-cols-2">
            <Row name="Rent" value={`${budgetLabel(listing.rent)}/mo`} />
            <Row name="Lease" value={label("lease", listing.lease)} />
            <Row name="Bedrooms" value={bedroomLabel(listing.bedrooms)} />
            <Row name="Washrooms" value={washroomLabel(listing.washrooms)} />
            <Row name="Parking" value={listing.parking === "none" ? "None" : listing.parking} />
            <Row name="Furnished" value={label("furnished", listing.furnished)} />
            <Row name="Available" value={label("timing", listing.available)} />
            <Row name="Area" value={listing.area} />
            <Row
              name="Address"
              value={
                listing.address
                  ? `${listing.address}${listing.unit ? `, ${listing.unit}` : ""}${
                      listing.postalCode ? `, ${listing.postalCode}` : ""
                    }`
                  : "Not listed"
              }
            />
            <Row name="Pets" value={label("pets", listing.petsPolicy)} />
            <Row name="Smoking" value={label("smoking", listing.smokingPolicy)} />
          </dl>

          <div className="mt-4">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
              What's included &amp; house rules
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {amenityWords.map((item) => (
                <span key={item} className="chip chip-muted">
                  {item}
                </span>
              ))}
              {!amenityWords.length ? (
                <span className="text-[12.5px] text-muted">No amenities listed yet.</span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-[#fffafc] p-3 text-[12px] leading-relaxed text-muted">
            <strong className="text-ink">Address</strong> —{" "}
            {listing.address
              ? `${listing.address}${listing.unit ? `, ${listing.unit}` : ""}`
              : "this listing has not added a street address"}
            . The unit address is confirmed again when a viewing is booked.
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Listing details are supplied by the landlord. Rent, availability and house rules are
            scored along with the household's lifestyle answers.
          </p>
        </div>
      </div>
    </div>
  );
}
