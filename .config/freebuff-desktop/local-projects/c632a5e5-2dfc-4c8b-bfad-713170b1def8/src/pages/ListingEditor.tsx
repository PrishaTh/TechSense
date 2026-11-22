import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Listing, Session } from "../../shared/types";
import { OPTIONS, budgetLabel, label } from "../../shared/types";
import { geocodeAddress, normalisePostal, suggestAddresses, validPostal } from "../../shared/geo";
import { Notice } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";

const AREA_GROUPS: { group: string; areas: string[] }[] = [
  {
    group: "Ontario – Toronto",
    areas: ["Downtown Toronto", "North York", "Scarborough", "Etobicoke"],
  },
  { group: "Ontario – Peel Region", areas: ["Mississauga", "Brampton", "Caledon"] },
  { group: "Ontario – York Region", areas: ["Markham", "Vaughan"] },
  {
    group: "Ontario – Southern & Central",
    areas: ["Hamilton", "Guelph", "London", "Niagara Region", "Grey County"],
  },
  { group: "Quebec", areas: ["Montréal", "Québec City", "Gatineau"] },
  { group: "New Brunswick", areas: ["Moncton", "Saint John", "Fredericton"] },
  { group: "Nova Scotia", areas: ["Halifax"] },
  { group: "Prince Edward Island", areas: ["Charlottetown"] },
  { group: "Newfoundland & Labrador", areas: ["St. John's"] },
  { group: "Manitoba", areas: ["Winnipeg"] },
  { group: "Saskatchewan", areas: ["Saskatoon", "Regina"] },
  { group: "Alberta", areas: ["Edmonton", "Calgary"] },
  { group: "British Columbia", areas: ["Vancouver"] },
];

const SPACE_LABELS: { value: string; label: string }[] = [
  { value: "room", label: "Room" },
  { value: "apartment", label: "Apartment" },
  { value: "basement", label: "Basement apartment" },
  { value: "house", label: "Whole house" },
  { value: "upper", label: "Upper floor" },
  { value: "rent_to_own", label: "Rent-to-own" },
];

const BEDROOM_LABELS = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1 bedroom" },
  { value: "2", label: "2 bedrooms" },
  { value: "3", label: "3 bedrooms" },
  { value: "4", label: "4 bedrooms" },
  { value: "5", label: "5+ bedrooms" },
];

const WASHROOM_LABELS = [
  { value: "1", label: "1 washroom" },
  { value: "1.5", label: "1.5 washrooms" },
  { value: "2", label: "2 washrooms" },
  { value: "2.5", label: "2.5 washrooms" },
  { value: "3", label: "3+ washrooms" },
  { value: "shared", label: "Shared washroom" },
];

const PARKING_OPTIONS = [
  "No parking",
  "Street parking",
  "1 parking spot",
  "2+ parking spots",
  "Garage",
];
const LAUNDRY_OPTIONS = [
  "In-suite laundry",
  "Shared laundry",
  "Coin laundry in building",
  "No laundry",
];
const FURNISHED_OPTIONS = [
  { value: "furnished", label: "Furnished" },
  { value: "partly", label: "Partly furnished" },
  { value: "unfurnished", label: "Unfurnished" },
];
const UTILITY_OPTIONS = [
  "Heat",
  "Hydro / electricity",
  "Water",
  "Internet / Wi-Fi",
  "Cable TV",
  "Air conditioning",
  "Snow removal",
];
const PET_OPTIONS = ["Pets welcome", "Cats only", "Dogs only", "Small pets only", "No pets"];
const SMOKING_OPTIONS = ["Non-smoking", "Smoking outside only", "Smoking allowed"];
const ENTRANCE_OPTIONS = ["Separate entrance", "Shared entrance"];
const LEASE_OPTIONS = [
  { value: "month", label: "Month-to-month" },
  { value: "6mo", label: "6 months" },
  { value: "1yr", label: "1 year" },
  { value: "2yr", label: "2+ years" },
  { value: "flexible", label: "Flexible" },
];
const KITCHEN_OPTIONS = ["Private kitchen", "Shared kitchen", "Kitchenette"];
const OUTDOOR_OPTIONS = ["Backyard", "Shared backyard", "Balcony", "Patio / deck", "No outdoor space"];
const FLOOR_OPTIONS = ["Basement", "Ground / main floor", "Upper floor", "High-rise unit"];
const HEATING_OPTIONS = [
  "Central air + heat",
  "Heat only",
  "Window / portable A/C",
  "Baseboard heat",
];
const AMENITY_OPTIONS = [
  "Fridge & stove",
  "Dishwasher",
  "Microwave",
  "Storage space",
  "Elevator",
  "Wheelchair accessible",
  "Gym",
  "Pool",
  "EV charging",
  "Security system / cameras",
  "Fireplace",
  "Close to transit",
  "Close to schools",
  "Close to shopping",
];

function parkingDetailFor(listing: Listing | null): string {
  if (!listing) return "";
  if (listing.parkingDetail) return listing.parkingDetail;
  if (listing.parking === "none") return "No parking";
  if (listing.parking === "street") return "Street parking";
  return "1 parking spot";
}

function petsDetailFor(listing: Listing | null): string {
  if (!listing) return "";
  if (listing.petsDetail) return listing.petsDetail;
  if (listing.petsPolicy === "cat") return "Cats only";
  if (listing.petsPolicy === "dog") return "Dogs only";
  if (listing.petsPolicy === "other") return "Small pets only";
  if (listing.petsPolicy === "none" || listing.petsPolicy === "no_pets") return "No pets";
  if (listing.petsPolicy === "loves_pets") return "Pets welcome";
  return "";
}

function smokingDetailFor(listing: Listing | null): string {
  if (!listing) return "";
  if (listing.smokingDetail) return listing.smokingDetail;
  if (listing.smokingPolicy === "non") return "Non-smoking";
  if (listing.smokingPolicy === "outside") return "Smoking outside only";
  if (listing.smokingPolicy === "smoker") return "Smoking allowed";
  return "";
}

async function shrinkPhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

function Ticks({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] has-checked:border-pink has-checked:bg-blush has-checked:font-semibold has-checked:text-crimson"
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[#a4123f]"
            checked={selected.includes(option)}
            onChange={() => onToggle(option)}
          />
          {option}
        </label>
      ))}
    </div>
  );
}

export default function ListingEditor() {
  const { id } = useParams();
  // The key makes a new-listing route a genuinely blank form even when the
  // landlord arrives from another listing's page.
  return <ListingForm key={id ?? "new"} />;
}

function ListingForm() {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const location = useLocation();
  const profile = session!.profile;
  const editing = routeId ?? null;
  const existing = editing
    ? (session!.listings ?? []).find((entry) => entry.id === editing) ?? null
    : null;
  const [saved, setSaved] = useState<Listing | null>(existing);
  const [justSaved, setJustSaved] = useState(
    Boolean((location.state as { justSaved?: boolean } | null)?.justSaved),
  );

  const [spaceType, setSpaceType] = useState(existing?.spaceType ?? "");
  const [area, setArea] = useState(existing?.area ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [postalCode, setPostalCode] = useState(existing?.postalCode ?? "");
  const [addressOpen, setAddressOpen] = useState(false);
  const [rent, setRent] = useState(existing ? String(existing.rent) : "");
  const [bedrooms, setBedrooms] = useState(existing ? String(existing.bedrooms) : "");
  const [washrooms, setWashrooms] = useState(
    existing
      ? existing.washroomsDetail === "Shared washroom"
        ? "shared"
        : String(existing.washrooms)
      : "",
  );
  const [availableFrom, setAvailableFrom] = useState(existing?.availableFrom ?? "");
  const [parkingDetail, setParkingDetail] = useState(parkingDetailFor(existing));
  const [laundry, setLaundry] = useState(existing?.laundry ?? "");
  const [furnished, setFurnished] = useState(existing?.furnished ?? "");
  const [utilities, setUtilities] = useState<string[]>(
    existing?.utilities?.length
      ? existing.utilities
      : existing?.amenities?.filter((item) => /heat|hydro|water|internet|cable|air cond|snow/i.test(item)) ?? [],
  );
  const [petsDetail, setPetsDetail] = useState(petsDetailFor(existing));
  const [smokingDetail, setSmokingDetail] = useState(smokingDetailFor(existing));
  const [entrance, setEntrance] = useState(existing?.entrance ?? "");
  const [lease, setLease] = useState(existing?.lease ?? "");
  const [kitchen, setKitchen] = useState(existing?.kitchen ?? "");
  const [outdoor, setOutdoor] = useState(existing?.outdoor ?? "");
  const [floorLevel, setFloorLevel] = useState(existing?.floorLevel ?? "");
  const [heatingCooling, setHeatingCooling] = useState(existing?.heatingCooling ?? "");
  const [sizeSqft, setSizeSqft] = useState(existing?.sizeSqft ? String(existing.sizeSqft) : "");
  const [amenities, setAmenities] = useState<string[]>(
    existing?.amenities?.filter(
      (item) => !/heat|hydro|water|internet|cable|air cond|snow/i.test(item),
    ) ?? [],
  );
  const [blurb, setBlurb] = useState(existing?.blurb ?? "");
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(list: string[], setList: (next: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = Math.max(0, 3 - photos.length);
    const picked = Array.from(files).slice(0, room);
    const converted: string[] = [];
    for (const file of picked) {
      const data = await shrinkPhoto(file);
      if (data && data.length <= 260000) converted.push(data);
    }
    if (!converted.length) {
      setError("Those photos could not be read. Try JPG, PNG or WebP images.");
      return;
    }
    setPhotos((current) => [...current, ...converted].slice(0, 3));
  }

  function missingFields(): string[] {
    const missing: string[] = [];
    if (!spaceType) missing.push("rental type");
    if (!area) missing.push("area");
    if (address.trim().length < 4) missing.push("street address");
    if (!postalCode.trim()) missing.push("postal code");
    if (!rent) missing.push("rent");
    if (!bedrooms) missing.push("bedrooms");
    if (!washrooms) missing.push("washrooms");
    if (!availableFrom) missing.push("available from");
    if (!parkingDetail) missing.push("parking");
    if (!laundry) missing.push("laundry");
    if (!furnished) missing.push("furnished");
    if (!petsDetail) missing.push("pets");
    if (!smokingDetail) missing.push("smoking");
    if (!entrance) missing.push("entrance");
    if (!lease) missing.push("lease length");
    if (!kitchen) missing.push("kitchen");
    if (!outdoor) missing.push("outdoor space");
    if (!floorLevel) missing.push("floor / level");
    if (!heatingCooling) missing.push("heating / cooling");
    if (!sizeSqft) missing.push("size");
    return missing;
  }

  async function save() {
    const missing = missingFields();
    if (missing.length) {
      setError(`Choose or enter: ${missing.join(", ")}.`);
      setMessage(null);
      return;
    }
    if (!validPostal(postalCode)) {
      setError("Enter a valid Canadian postal code, e.g. L6Y 1A1.");
      setMessage(null);
      return;
    }
    const point = geocodeAddress({ city: area, street: address, unit, postalCode });
    if (!point) {
      setError("We couldn't geocode that address. Check the street, city and postal code.");
      setMessage(null);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const washroomsValue = washrooms === "shared" ? 1 : Number(washrooms);
      const result = await api<Session & { savedListingId?: string }>("/api/me/listing", {
        method: "POST",
        body: JSON.stringify({
          id: editing ?? undefined,
          area,
          address,
          unit,
          postalCode,
          rent: Number(rent),
          spaceType,
          bedrooms: Number(bedrooms),
          washrooms: washroomsValue,
          washroomsDetail: washrooms === "shared" ? "Shared washroom" : null,
          availableFrom,
          parkingDetail,
          laundry,
          furnished,
          utilities,
          petsDetail,
          smokingDetail,
          entrance,
          lease,
          kitchen,
          outdoor,
          floorLevel,
          heatingCooling,
          sizeSqft: Number(sizeSqft),
          amenities,
          blurb,
          photos,
        }),
      });
      setSession(result);
      const savedId = result.savedListingId ?? editing;
      setSaved(result.listings?.find((entry) => entry.id === savedId) ?? result.listing);
      setJustSaved(true);
      if (!editing && savedId) {
        // Moving to the saved listing keeps the “Add another listing” link able
        // to open a genuinely blank form instead of this one.
        navigate(`/app/listing/${savedId}`, { replace: true, state: { justSaved: true } });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setState(change: { paused?: boolean; leased?: boolean }) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<Session>("/api/me/listing/state", {
        method: "POST",
        body: JSON.stringify({ ...change, id: saved?.id }),
      });
      setSession(result);
      setSaved(result.listing);
      setMessage(
        change.paused === true
          ? "Listing paused — it is hidden from tenant decks."
          : change.paused === false
            ? "Listing resumed."
            : change.leased === true
              ? "Marked as leased — it is hidden from tenant decks."
              : "Marked available again.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (editing && !existing) {
    return (
      <div className="mx-auto max-w-xl">
        <Notice tone="warn">This listing could not be found on your account.</Notice>
        <Link to="/app/listings" className="btn btn-primary btn-sm mt-3">
          Back to my listings
        </Link>
      </div>
    );
  }

  const previewTitle = saved?.title ??
    `${bedrooms === "0" ? "Studio" : bedrooms ? `${bedrooms} bedroom` : "Home"} ${
      spaceType ? label("spaceType", spaceType).toLowerCase() : "rental"
    } in ${area || "your area"}`;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{saved ? "Edit listing" : "New listing"}</div>
          <h1 className="section-title mt-1.5">{saved ? saved.title : "List your home"}</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">
            Same form as the original Deservia listing builder. These facts feed the matching
            algorithm and the tenant&apos;s deck.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved?.paused ? <span className="chip chip-warn">Paused</span> : null}
          {saved?.leased ? <span className="chip">Leased</span> : null}
          {saved && !saved.paused && !saved.leased ? (
            <span className="chip chip-ok">Live in tenant decks</span>
          ) : null}
          <Link to="/app/listings" className="btn btn-ghost btn-sm">
            My listings
          </Link>
          {saved ? (
            <Link to="/app/requests" className="btn btn-ghost btn-sm">
              Requests
            </Link>
          ) : null}
        </div>
      </div>

      {justSaved ? (
        <div className="mt-4 rounded-2xl border border-[#bfe6d4] bg-[#f2fbf7] p-4">
          <p className="text-[15px] font-extrabold text-[#166534]">Listing saved</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {saved ? `${saved.title} is now in My listings.` : "It is now in My listings."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/listing/new" className="btn btn-primary btn-sm">
              Add another listing
            </Link>
            <Link to="/app/listings" className="btn btn-ghost btn-sm">
              View my listings
            </Link>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="mt-4">
          <Notice tone="ok">{message}</Notice>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">Rental type</span>
              <select
                className="select"
                value={spaceType}
                onChange={(event) => setSpaceType(event.target.value)}
              >
                <option value="">Rental type…</option>
                {SPACE_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Area</span>
              <select
                className="select"
                value={area}
                onChange={(event) => setArea(event.target.value)}
              >
                <option value="">Area…</option>
                {AREA_GROUPS.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.areas.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Rent $/mo</span>
              <input
                type="number"
                min={200}
                max={20000}
                step={25}
                className="input"
                placeholder="Rent $/mo"
                value={rent}
                onChange={(event) => setRent(event.target.value)}
              />
              {rent ? (
                <span className="mt-1 block text-[11.5px] text-muted">
                  {budgetLabel(Number(rent) || 0)}/mo
                </span>
              ) : null}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="relative block">
              <span className="field-label">Street address</span>
              <input
                className="input"
                placeholder={area ? `e.g. 123 Main St, ${area}` : "Choose a city first"}
                value={address}
                disabled={!area}
                autoComplete="off"
                onChange={(event) => {
                  setAddress(event.target.value);
                  setAddressOpen(true);
                }}
                onFocus={() => setAddressOpen(true)}
                onBlur={() => window.setTimeout(() => setAddressOpen(false), 150)}
              />
              {addressOpen && area
                ? (() => {
                    const suggestions = suggestAddresses(area, address, 5);
                    if (!suggestions.length) return null;
                    return (
                      <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lift">
                        {suggestions.map((entry) => (
                          <li key={entry.label}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-mist"
                              onMouseDown={() => {
                                setAddress(entry.street);
                                setAddressOpen(false);
                              }}
                            >
                              {entry.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()
                : null}
            </label>
            <label className="block">
              <span className="field-label">Unit / suite (optional)</span>
              <input
                className="input"
                placeholder="e.g. Unit 4B"
                value={unit}
                maxLength={20}
                onChange={(event) => setUnit(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Postal code</span>
              <input
                className="input"
                placeholder="e.g. L6Y 1A1"
                value={postalCode}
                maxLength={7}
                onChange={(event) => setPostalCode(event.target.value.toUpperCase())}
                onBlur={() => {
                  const clean = normalisePostal(postalCode);
                  if (clean) setPostalCode(clean);
                }}
              />
              {postalCode && !validPostal(postalCode) ? (
                <span className="mt-1 block text-[11.5px] font-semibold text-crimson">
                  Canadian format: A1A 1A1
                </span>
              ) : null}
            </label>
          </div>

          {area && address.trim().length >= 4 && validPostal(postalCode) ? (
            (() => {
              const point = geocodeAddress({ city: area, street: address, unit, postalCode });
              return (
                <p className="-mt-2 text-[11.5px] text-muted">
                  {point
                    ? `📍 Geocoded to ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)} — tenants see the distance from their own address.`
                    : "That address could not be geocoded. Correct the street or postal code before saving."}
                </p>
              );
            })()
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">Bedrooms</span>
              <select
                className="select"
                value={bedrooms}
                onChange={(event) => setBedrooms(event.target.value)}
              >
                <option value="">Bedrooms…</option>
                {BEDROOM_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Washrooms</span>
              <select
                className="select"
                value={washrooms}
                onChange={(event) => setWashrooms(event.target.value)}
              >
                <option value="">Washrooms…</option>
                {WASHROOM_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Available from</span>
              <input
                type="date"
                className="input"
                value={availableFrom}
                onChange={(event) => setAvailableFrom(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">Parking</span>
              <select
                className="select"
                value={parkingDetail}
                onChange={(event) => setParkingDetail(event.target.value)}
              >
                <option value="">Parking…</option>
                {PARKING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Laundry</span>
              <select
                className="select"
                value={laundry}
                onChange={(event) => setLaundry(event.target.value)}
              >
                <option value="">Laundry…</option>
                {LAUNDRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Furnished</span>
              <select
                className="select"
                value={furnished}
                onChange={(event) => setFurnished(event.target.value)}
              >
                <option value="">Furnished…</option>
                {FURNISHED_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-[13px] font-bold">Included in rent (tick all that apply)</p>
            <Ticks
              options={UTILITY_OPTIONS}
              selected={utilities}
              onToggle={(value) => toggle(utilities, setUtilities, value)}
            />
          </div>

          <div>
            <p className="text-[13px] font-bold">House rules &amp; more details</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <label className="block">
                <select
                  className="select"
                  value={petsDetail}
                  onChange={(event) => setPetsDetail(event.target.value)}
                  aria-label="Pets"
                >
                  <option value="">Pets…</option>
                  {PET_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <select
                  className="select"
                  value={smokingDetail}
                  onChange={(event) => setSmokingDetail(event.target.value)}
                  aria-label="Smoking"
                >
                  <option value="">Smoking…</option>
                  {SMOKING_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <select
                  className="select"
                  value={entrance}
                  onChange={(event) => setEntrance(event.target.value)}
                  aria-label="Entrance"
                >
                  <option value="">Entrance…</option>
                  {ENTRANCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <select
                className="select"
                value={lease}
                onChange={(event) => setLease(event.target.value)}
                aria-label="Lease length"
              >
                <option value="">Lease length…</option>
                {LEASE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <select
                className="select"
                value={kitchen}
                onChange={(event) => setKitchen(event.target.value)}
                aria-label="Kitchen"
              >
                <option value="">Kitchen…</option>
                {KITCHEN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <select
                className="select"
                value={outdoor}
                onChange={(event) => setOutdoor(event.target.value)}
                aria-label="Outdoor space"
              >
                <option value="">Outdoor space…</option>
                {OUTDOOR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <select
                className="select"
                value={floorLevel}
                onChange={(event) => setFloorLevel(event.target.value)}
                aria-label="Floor or level"
              >
                <option value="">Floor / level…</option>
                {FLOOR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <select
                className="select"
                value={heatingCooling}
                onChange={(event) => setHeatingCooling(event.target.value)}
                aria-label="Heating and cooling"
              >
                <option value="">Heating / cooling…</option>
                {HEATING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Size (sq ft)</span>
              <input
                type="number"
                min={100}
                max={20000}
                className="input"
                placeholder="Size (sq ft)"
                value={sizeSqft}
                onChange={(event) => setSizeSqft(event.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="text-[13px] font-bold">Features &amp; amenities (tick all that apply)</p>
            <Ticks
              options={AMENITY_OPTIONS}
              selected={amenities}
              onToggle={(value) => toggle(amenities, setAmenities, value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="listing-blurb">
              Describe your home (optional)
            </label>
            <textarea
              id="listing-blurb"
              className="textarea"
              rows={3}
              maxLength={600}
              value={blurb}
              onChange={(event) => setBlurb(event.target.value)}
              placeholder="e.g. Bright, quiet basement with a separate entrance, 5 min walk to the bus. Looking for a tidy, respectful tenant."
            />
          </div>

          <div>
            <p className="text-[13px] font-bold">Home photos</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="btn btn-ghost btn-sm cursor-pointer">
                📷 Upload home photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <span className="text-[11.5px] text-muted">
                {photos.length ? `${photos.length} of 3 photos` : "No photos yet — up to 3"}
              </span>
            </div>
            {photos.length ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative overflow-hidden rounded-xl border border-line">
                    <img
                      src={photo}
                      alt={`Home photo ${index + 1}`}
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPhotos((current) => current.filter((_, i) => i !== index))
                      }
                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-navy/70 text-[11px] text-white"
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-1 text-[11px] text-muted">
              Photos are resized in your browser before upload. They appear on the listing and in the
              tenant&apos;s details view.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : saved ? "Save changes" : "✨ Generate my listing"}
            </button>
            {saved ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void setState({ paused: !saved.paused })}
                >
                  {saved.paused ? "Resume listing" : "Pause listing"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => void setState({ leased: !saved.leased })}
                >
                  {saved.leased ? "Mark available" : "Mark leased"}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="card p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Preview</p>
            {photos.length ? (
              <img
                src={photos[0]}
                alt="Listing preview"
                className="mt-2 h-28 w-full rounded-xl object-cover"
              />
            ) : null}
            <div className="mt-2 flex items-start gap-2.5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blush text-xl">
                {profile.avatar || "🏡"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-extrabold">{previewTitle}</p>
                <p className="text-[12px] text-muted">
                  {area || "Area"} · {budgetLabel(Number(rent) || 0)}/mo
                </p>
                <p className="mt-1 line-clamp-2 text-[11.5px] text-muted">
                  {blurb || "Your description appears here."}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[
                bedrooms && (bedrooms === "0" ? "Studio" : `${bedrooms} bed`),
                washrooms && (washrooms === "shared" ? "Shared bath" : `${washrooms} bath`),
                laundry,
                parkingDetail,
                ...utilities.slice(0, 2),
              ]
                .filter(Boolean)
                .map((tag) => (
                  <span key={String(tag)} className="chip chip-muted">
                    {tag}
                  </span>
                ))}
            </div>
          </div>

          <div className="card p-4 text-[12px] leading-relaxed text-muted">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em]">How this is matched</p>
            <p className="mt-1.5">
              Type, area, rent, bedrooms, washrooms, parking, furnishing, lease, pets and smoking are
              scored against tenant answers. Filters use area, bedrooms and rent. The rest is shown
              to tenants and to the assistant.
            </p>
            <p className="mt-2">
              The full street address is geocoded on save and decides the distance on every tenant
              card. Your first listing is free for 30 days.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
