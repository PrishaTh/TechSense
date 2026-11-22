import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { GeoPoint, Home, Lifestyle, Session } from "../../shared/types";
import {
  AREAS,
  HOBBY_OPTIONS,
  OPTIONS,
  PRICE_CEILING,
  PRICE_FLOOR,
  PRICE_STEP,
  UNIT_TYPE_OPTIONS,
  budgetLabel,
  nearestCity,
} from "../../shared/types";
import { geocodeAddress, normalisePostal, suggestAddresses, validPostal } from "../../shared/geo";
import { Notice } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";

const DEFAULT_HOME: Home = {
  spaceType: "apartment",
  area: "Brampton",
  budget: 1500,
  timing: "within_month",
  bedrooms: 1,
  washrooms: 1,
  parking: "nice",
  furnished: "unfurnished",
  lease: "1yr",
  issueSpeed: "24h",
  concern: "repairs",
  radiusKm: null,
  center: null,
  unitTypes: [],
  priceMin: PRICE_FLOOR,
  priceMax: PRICE_CEILING,
  priceNoPref: true,
};

type StepId =
  | "spaceType"
  | "area"
  | "hobbies"
  | "work"
  | "workDays"
  | "pets"
  | "smoking"
  | "diet"
  | "chronotype"
  | "social"
  | "tidiness"
  | "music"
  | "travel"
  | "drives"
  | "timing";

const STEPS: StepId[] = [
  "spaceType",
  "area",
  "hobbies",
  "work",
  "workDays",
  "pets",
  "smoking",
  "diet",
  "chronotype",
  "social",
  "tidiness",
  "music",
  "travel",
  "drives",
  "timing",
];

const PET_CHOICES = OPTIONS.pets.slice(0, 3);
const SMOKING_CHOICES = OPTIONS.smoking.slice(0, 3);
const MUSIC_CHOICES = OPTIONS.music.slice(0, 2);

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[22px] font-extrabold leading-tight">{title}</h2>
      {hint ? <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Choices({
  options,
  selected,
  onPick,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="opt"
          data-selected={selected.includes(option.value)}
          aria-pressed={selected.includes(option.value)}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function Questionnaire() {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const profile = session!.profile;
  const isLandlord = profile.role === "landlord";
  const listing = session!.listing;
  const location = useLocation();
  const scopeParam = new URLSearchParams(location.search).get("scope");
  const scope: "all" | "filters" | "answers" =
    scopeParam === "filters" ? "filters" : scopeParam === "answers" ? "answers" : "all";
  const steps =
    scope === "filters" ? STEPS.slice(0, 2) : scope === "answers" ? STEPS.slice(2) : STEPS;

  const [step, setStep] = useState(0);
  const [lifestyle, setLifestyle] = useState<Lifestyle>(profile.lifestyle);
  const [home, setHome] = useState<Home>(() => {
    if (profile.home) return { ...DEFAULT_HOME, ...profile.home };
    if (isLandlord && listing) {
      return {
        ...DEFAULT_HOME,
        spaceType: listing.spaceType,
        area: listing.area,
        budget: listing.rent,
        bedrooms: listing.bedrooms,
        washrooms: listing.washrooms,
        parking: listing.parking,
        furnished: listing.furnished,
        lease: listing.lease,
        timing: listing.available,
      };
    }
    return DEFAULT_HOME;
  });
  const [addressQuery, setAddressQuery] = useState(profile.home?.address ?? "");
  const [postalQuery, setPostalQuery] = useState(profile.home?.postalCode ?? "");
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [keepOutside, setKeepOutside] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = steps[step];
  const isLast = step === steps.length - 1;
  const questionOffset = scope === "answers" ? 2 : 0;
  const questionNumber = questionOffset + step + 1;
  const questionTotal = scope === "answers" ? STEPS.length : steps.length;
  const firstName = profile.name.split(/\s+/)[0] || profile.name;
  const center = home.center ?? null;
  const radius = home.radiusKm ?? 5;
  const priceNoPref = home.priceNoPref ?? true;
  const priceMin = home.priceMin ?? PRICE_FLOOR;
  const priceMax = home.priceMax ?? PRICE_CEILING;
  const unitTypes = home.unitTypes ?? [];

  const centerCity = center ? center.city ?? nearestCity(center) : null;
  const outsideCity = centerCity && centerCity !== home.area ? centerCity : null;

  function setLife<K extends keyof Lifestyle>(key: K, value: Lifestyle[K]) {
    setLifestyle((current) => ({ ...current, [key]: value }));
  }

  function setHomeField<K extends keyof Home>(key: K, value: Home[K]) {
    setHome((current) => ({ ...current, [key]: value }));
  }

  function setCenter(point: GeoPoint | null) {
    setKeepOutside(false);
    setHomeField("center", point);
  }

  function useMyLocation() {
    setGeoNote(null);
    if (!navigator.geolocation) {
      setGeoNote("This browser can't share a location. Enter an address instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: GeoPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Your current location",
        };
        const city = nearestCity(point);
        setCenter({ ...point, city, label: `Your current location · ${city}` });
        setHomeField("radiusKm", home.radiusKm ?? 5);
        setAddressQuery("");
        setGeoNote("Location found. It is saved with your search area when you finish.");
      },
      () => {
        setGeoNote("We couldn't get your location. Enter an address instead.");
      },
      { timeout: 10000, maximumAge: 0 },
    );
  }

  function clearArea() {
    setAddressQuery("");
    setGeoNote(null);
    setKeepOutside(false);
    setHome((current) => ({ ...current, center: null, radiusKm: null }));
  }

  function pickSuggestion(street: string) {
    setAddressQuery(street);
    setGeoNote(null);
  }

  /**
   * The tenant's address is geocoded with the same gazetteer as a listing, so
   * the radius and the distance on each card use one consistent point.
   */
  function useAddress() {
    if (!addressQuery.trim()) {
      setGeoNote("Enter your street address first.");
      return;
    }
    if (!validPostal(postalQuery)) {
      setGeoNote("Enter a valid Canadian postal code, e.g. L6Y 1A1.");
      return;
    }
    const point = geocodeAddress({
      city: home.area,
      street: addressQuery,
      postalCode: postalQuery,
    });
    if (!point) {
      setGeoNote("We couldn't geocode that address. Check the street, city and postal code.");
      return;
    }
    setCenter({ lat: point.lat, lng: point.lng, label: point.label, city: home.area });
    setHomeField("radiusKm", home.radiusKm ?? 5);
    setHomeField("address", addressQuery.trim());
    setHomeField("postalCode", point.postalCode);
    setPostalQuery(point.postalCode);
    setGeoNote(null);
  }

  function toggleUnit(value: number) {
    setHomeField(
      "unitTypes",
      unitTypes.includes(value)
        ? unitTypes.filter((entry) => entry !== value)
        : [...unitTypes, value].sort((a, b) => a - b),
    );
  }

  function next() {
    setError(null);
    if (isLast) {
      void save();
      return;
    }
    setStep((current) => current + 1);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<Session>("/api/me", {
        method: "PUT",
        body: JSON.stringify({
          lifestyle: { ...lifestyle, issueSpeed: home.issueSpeed },
          home,
        }),
      });
      setSession(result);
      if (scope === "filters") {
        navigate("/app/deck");
      } else if (scope === "answers") {
        navigate("/app/profile");
      } else if (isLandlord && !result.listing) {
        navigate("/app/listing");
      } else {
        navigate("/app/deck");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (profile.role === "admin") {
    return <Notice tone="warn">Admin accounts do not have a matching questionnaire.</Notice>;
  }

  const suggestions =
    addressQuery.trim().length >= 2 && !home.center
      ? suggestAddresses(home.area, addressQuery, 6)
      : [];

  function renderQuestion() {
    switch (id) {
      case "spaceType":
        return (
          <Question
            title={isLandlord ? "What are you offering?" : "What are you looking for?"}
            hint="Pick the type of rental."
          >
            <Choices
              options={OPTIONS.spaceType}
              selected={[home.spaceType]}
              onPick={(value) => setHomeField("spaceType", value)}
            />

            <div className="mt-7 border-t border-line pt-5">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                Filter results (optional)
              </p>
              <p className="mt-3 text-[13px] font-bold">
                What size of place are you looking for?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="opt"
                  data-selected={unitTypes.length === 0}
                  onClick={() => setHomeField("unitTypes", [])}
                >
                  Any
                </button>
                {UNIT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="opt"
                    data-selected={unitTypes.includes(option.value)}
                    onClick={() => toggleUnit(option.value)}
                  >
                    {option.label}
                    <span className="ml-1 text-[10.5px] font-medium opacity-70">
                      ({option.hint})
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-bold">What's your budget per month?</p>
                  <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#a4123f]"
                      checked={priceNoPref}
                      onChange={(event) =>
                        setHomeField("priceNoPref", event.target.checked)
                      }
                    />
                    No preference
                  </label>
                </div>

                <div
                  className={`mt-3 rounded-2xl border border-line bg-mist p-4 ${
                    priceNoPref ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-[12.5px] font-bold">
                    <span>{budgetLabel(priceMin)}</span>
                    <span>
                      {budgetLabel(priceMin)}–{budgetLabel(priceMax)} / month
                    </span>
                    <span>{budgetLabel(priceMax)}</span>
                  </div>
                  <label className="mt-3 block text-[11.5px] font-semibold text-muted">
                    Lowest
                    <input
                      type="range"
                      className="mt-1 w-full accent-[#a4123f]"
                      min={PRICE_FLOOR}
                      max={PRICE_CEILING}
                      step={PRICE_STEP}
                      value={priceMin}
                      onChange={(event) =>
                        setHomeField(
                          "priceMin",
                          Math.min(Number(event.target.value), priceMax),
                        )
                      }
                    />
                  </label>
                  <label className="mt-2 block text-[11.5px] font-semibold text-muted">
                    Highest
                    <input
                      type="range"
                      className="mt-1 w-full accent-[#a4123f]"
                      min={PRICE_FLOOR}
                      max={PRICE_CEILING}
                      step={PRICE_STEP}
                      value={priceMax}
                      onChange={(event) =>
                        setHomeField(
                          "priceMax",
                          Math.max(Number(event.target.value), priceMin),
                        )
                      }
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-[11.5px] font-semibold text-muted">
                      Min (CAD)
                      <input
                        type="number"
                        className="input mt-1"
                        min={0}
                        step={PRICE_STEP}
                        value={priceMin}
                        onChange={(event) =>
                          setHomeField(
                            "priceMin",
                            Math.min(Number(event.target.value) || 0, priceMax),
                          )
                        }
                      />
                    </label>
                    <label className="text-[11.5px] font-semibold text-muted">
                      Max (CAD)
                      <input
                        type="number"
                        className="input mt-1"
                        min={0}
                        step={PRICE_STEP}
                        value={priceMax}
                        onChange={(event) =>
                          setHomeField(
                            "priceMax",
                            Math.max(Number(event.target.value) || 0, priceMin),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-[11.5px] text-muted">
                  Leave it on No preference to keep every price in your city.
                </p>
              </div>
            </div>
          </Question>
        );

      case "area":
        return (
          <Question title="Which area?" hint="Where you want to live / where your place is.">
            <label className="field-label" htmlFor="area">
              City
            </label>
            <select
              id="area"
              className="select"
              value={home.area}
              onChange={(event) => {
                setHomeField("area", event.target.value);
                // The point belongs to the old city's gazetteer.
                setCenter(null);
                setAddressQuery("");
                setPostalQuery("");
              }}
            >
              {AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>

            <div className="mt-5 rounded-2xl border border-line bg-mist p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-bold">
                  Narrow it down to a specific area (optional)
                </p>
                {center ? (
                  <button
                    type="button"
                    className="text-[11.5px] font-bold text-crimson underline underline-offset-2"
                    onClick={clearArea}
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {!center ? (
                <div className="mt-3 space-y-3">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}>
                    📍 Use my current location
                  </button>
                  <div>
                    <label className="field-label" htmlFor="address">
                      Or enter your street address
                    </label>
                    <input
                      id="address"
                      className="input"
                      placeholder={`e.g. 123 Main St, ${home.area}`}
                      value={addressQuery}
                      onChange={(event) => setAddressQuery(event.target.value)}
                      autoComplete="off"
                    />
                    {suggestions.length ? (
                      <ul className="mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                        {suggestions.map((entry) => (
                          <li key={entry.label}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-mist"
                              onClick={() => pickSuggestion(entry.street)}
                            >
                              {entry.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="min-w-[150px] flex-1 text-[12px] font-semibold text-muted">
                        Postal code
                        <input
                          className="input mt-1"
                          placeholder="L6Y 1A1"
                          maxLength={7}
                          value={postalQuery}
                          onChange={(event) => setPostalQuery(event.target.value.toUpperCase())}
                          onBlur={() => {
                            const clean = normalisePostal(postalQuery);
                            if (clean) setPostalQuery(clean);
                          }}
                        />
                      </label>
                      <button type="button" className="btn btn-primary btn-sm" onClick={useAddress}>
                        Use this address
                      </button>
                    </div>
                    {geoNote ? (
                      <p className="mt-1.5 text-[11.5px] font-semibold text-crimson">{geoNote}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-[12.5px] font-semibold">📍 {center.label}</p>

                  <label className="mt-3 block text-[12px] font-semibold text-muted">
                    Radius: within {radius} km
                    <input
                      type="range"
                      className="mt-1 w-full accent-[#a4123f]"
                      min={1}
                      max={25}
                      step={1}
                      value={radius}
                      onChange={(event) =>
                        setHomeField("radiusKm", Number(event.target.value))
                      }
                    />
                  </label>

                  {outsideCity && !keepOutside ? (
                    <div className="mt-3 rounded-xl border border-[#f1d58a] bg-[#fff7e6] p-3 text-[12px] text-[#8a5a00]">
                      <p className="font-bold">This address is outside {home.area}.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setHomeField("area", outsideCity);
                            setKeepOutside(true);
                          }}
                        >
                          Switch to {outsideCity}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setKeepOutside(true)}
                        >
                          Keep {home.area}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {geoNote ? (
                <p className="mt-3 text-[11.5px] font-semibold text-muted">{geoNote}</p>
              ) : null}

              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Optional. Skip it to keep every listing in the city. Live location is used for
                this session only and is not saved to your profile.
              </p>
            </div>
          </Question>
        );

      case "hobbies":
        return (
          <Question title="What are you into?" hint="Pick all that apply.">
            <Choices
              options={HOBBY_OPTIONS}
              selected={lifestyle.hobbies}
              onPick={(value) =>
                setLife(
                  "hobbies",
                  lifestyle.hobbies.includes(value)
                    ? lifestyle.hobbies.filter((entry) => entry !== value)
                    : [...lifestyle.hobbies, value],
                )
              }
            />
          </Question>
        );

      case "work":
        return (
          <Question
            title="What's your work situation?"
            hint="Used for compatibility, never to exclude anyone."
          >
            <Choices
              options={OPTIONS.work}
              selected={[lifestyle.work ?? ""]}
              onPick={(value) => setLife("work", value)}
            />
          </Question>
        );

      case "workDays":
        return (
          <Question title="Where do you spend your days?">
            <Choices
              options={OPTIONS.workDays}
              selected={[lifestyle.schedule]}
              onPick={(value) => setLife("schedule", value)}
            />
          </Question>
        );

      case "pets":
        return (
          <Question title="Pets?">
            <Choices
              options={PET_CHOICES}
              selected={[lifestyle.pets]}
              onPick={(value) => setLife("pets", value)}
            />
          </Question>
        );

      case "smoking":
        return (
          <Question title="Smoking?">
            <Choices
              options={SMOKING_CHOICES}
              selected={[lifestyle.smoking]}
              onPick={(value) => setLife("smoking", value)}
            />
          </Question>
        );

      case "diet":
        return (
          <Question title="How do you eat?" hint="Great for shared kitchens.">
            <Choices
              options={OPTIONS.diet}
              selected={[lifestyle.diet ?? ""]}
              onPick={(value) => setLife("diet", value)}
            />
          </Question>
        );

      case "chronotype":
        return (
          <Question title="Early bird or night owl?">
            <Choices
              options={OPTIONS.chronotype}
              selected={[lifestyle.chronotype]}
              onPick={(value) => setLife("chronotype", value)}
            />
          </Question>
        );

      case "social":
        return (
          <Question title="Introvert or extrovert?">
            <Choices
              options={OPTIONS.social}
              selected={[lifestyle.social]}
              onPick={(value) => setLife("social", value)}
            />
          </Question>
        );

      case "tidiness":
        return (
          <Question title="How tidy are you?">
            <Choices
              options={OPTIONS.tidiness}
              selected={[lifestyle.tidiness]}
              onPick={(value) => setLife("tidiness", value)}
            />
          </Question>
        );

      case "music":
        return (
          <Question title="Music at home?">
            <Choices
              options={MUSIC_CHOICES}
              selected={[lifestyle.music]}
              onPick={(value) => setLife("music", value)}
            />
          </Question>
        );

      case "travel":
        return (
          <Question title="Travel?">
            <Choices
              options={OPTIONS.travel}
              selected={[lifestyle.travel ?? ""]}
              onPick={(value) => setLife("travel", value)}
            />
          </Question>
        );

      case "drives":
        return (
          <Question title="Do you drive?">
            <Choices
              options={OPTIONS.drives}
              selected={[lifestyle.drives ?? ""]}
              onPick={(value) => setLife("drives", value)}
            />
          </Question>
        );

      case "timing":
        return (
          <Question
            title="Timing?"
            hint="When do you want to move / have it filled?"
          >
            <Choices
              options={OPTIONS.timing}
              selected={[home.timing]}
              onPick={(value) => setHomeField("timing", value)}
            />
          </Question>
        );

      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">
            {firstName} · {isLandlord ? "Landlord" : "Tenant"}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            {scope === "filters"
              ? "Edit filters · questions 1–2 of 15"
              : scope === "answers"
                ? "Edit matching answers · questions 3–15 of 15"
                : "Matching questionnaire"}
          </p>
        </div>
        <span className="text-[12.5px] font-semibold text-muted">
          Question {questionNumber} of {questionTotal}
        </span>
      </div>

      <div
        className="mt-3 meter"
        role="progressbar"
        aria-valuenow={questionNumber}
        aria-valuemin={1}
        aria-valuemax={questionTotal}
      >
        <span style={{ width: `${(questionNumber / questionTotal) * 100}%` }} />
      </div>

      <div className="card mt-5 p-5 sm:p-7">
        {renderQuestion()}

        {error ? (
          <p className="mt-4 rounded-xl bg-blush px-3.5 py-2.5 text-[13px] font-semibold text-crimson">
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {step > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setStep((current) => current - 1)}
              disabled={busy}
            >
              ← Back
            </button>
          ) : scope !== "all" ? (
            <Link
              to={scope === "filters" ? "/app/deck" : "/app/profile"}
              className="btn btn-ghost btn-sm"
            >
              ← {scope === "filters" ? "Back to deck" : "Back to My account"}
            </Link>
          ) : null}
          <button type="button" className="btn btn-primary ml-auto" onClick={next} disabled={busy}>
            {busy ? "Saving…" : isLast ? "Save answers" : "Continue →"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        {isLandlord
          ? "Your answers describe how you live; your listing supplies the home facts."
          : "Your answers are the only thing Deservia scores. You can change them later."}{" "}
        Protected grounds are never asked.
      </p>
    </div>
  );
}
