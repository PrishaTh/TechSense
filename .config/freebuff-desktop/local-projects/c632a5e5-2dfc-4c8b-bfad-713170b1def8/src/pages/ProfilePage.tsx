import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OPTIONS, budgetLabel, hobbyLabel, label } from "../../shared/types";
import { Avatar, Notice, Stars } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";

function Pairs({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="border-b border-line/60 pb-1.5">
          <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            {row.label}
          </dt>
          <dd className="text-[13.5px] font-semibold">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ProfilePage() {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const profile = session!.profile;
  const listing = session!.listing;
  const trust = session!.trust;
  const lifestyle = profile.lifestyle;
  const home = profile.home;

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const matches = await api("/api/matches");
      const payload = {
        exportedAt: new Date().toISOString(),
        profile,
        listing,
        trust,
        matches,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "deservia-my-data.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Your data was downloaded as JSON.");
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/me", { method: "DELETE" });
      setSession(null);
      navigate("/");
    } catch (cause) {
      setMessage(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card flex flex-wrap items-start gap-4 p-5">
        <Avatar emoji={profile.avatar} accent={profile.accent} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-extrabold">{profile.name}</h1>
            <span className="chip chip-muted capitalize">{profile.role}</span>
            {trust.badge ? <span className="chip chip-ok">Highly rated</span> : null}
          </div>
          <p className="mt-1 text-[14px] text-muted">{profile.tagline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {home ? (
              <>
                <span className="chip">{home.area}</span>
                <span className="chip chip-muted">{budgetLabel(home.budget)}/mo</span>
                <span className="chip chip-muted">{label("lease", home.lease)}</span>
                <span className="chip chip-muted">{label("spaceType", home.spaceType)}</span>
              </>
            ) : listing ? (
              <>
                <span className="chip">{listing.area}</span>
                <span className="chip chip-muted">{budgetLabel(listing.rent)}/mo</span>
                <span className="chip chip-muted">{listing.title}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <Link to="/app/questionnaire?scope=answers" className="btn btn-primary btn-sm">
            Edit matching answers
          </Link>
          {trust.average ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-[#fffafc] px-3 py-1.5">
              <Stars value={trust.average} size={13} />
              <span className="text-[12.5px] font-bold">
                {trust.average} ({trust.count})
              </span>
            </div>
          ) : (
            <span className="text-center text-[11.5px] text-muted">No ratings yet</span>
          )}
        </div>
      </div>

      {message ? (
        <div className="mt-4">
          <Notice tone="ok">{message}</Notice>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
              What Deservia matches on
            </h2>
            <p className="mt-1 text-[12.5px] text-muted">
              Only these answers feed your score. They describe how you live, not who you are.
            </p>

            <div className="mt-4">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-crimson">
                Lifestyle
              </h3>
              <div className="mt-2">
                <Pairs
                  rows={[
                    { label: "Schedule", value: label("schedule", lifestyle.schedule) },
                    { label: "Sleep", value: label("chronotype", lifestyle.chronotype) },
                    { label: "Social", value: label("social", lifestyle.social) },
                    { label: "Tidiness", value: label("tidiness", lifestyle.tidiness) },
                    { label: "Music & noise", value: label("music", lifestyle.music) },
                    { label: "Pets", value: label("pets", lifestyle.pets) },
                    { label: "Smoking", value: label("smoking", lifestyle.smoking) },
                    { label: "Kitchen", value: label("kitchenUse", lifestyle.kitchenUse) },
                    { label: "Cooking smells", value: label("smells", lifestyle.smells) },
                    {
                      label: "Hobbies",
                      value:
                        lifestyle.hobbies.map(hobbyLabel).join(", ") || "—",
                    },
                  ]}
                />
              </div>
            </div>

            {home ? (
              <div className="mt-5">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-crimson">
                  Home
                </h3>
                <div className="mt-2">
                  <Pairs
                    rows={[
                      { label: "Space", value: label("spaceType", home.spaceType) },
                      { label: "Area", value: home.area },
                      { label: "Budget", value: `${budgetLabel(home.budget)}/mo` },
                      { label: "Move-in", value: label("timing", home.timing) },
                      { label: "Bedrooms", value: home.bedrooms === 0 ? "Studio" : String(home.bedrooms) },
                      { label: "Washrooms", value: String(home.washrooms) },
                      { label: "Parking", value: label("parking", home.parking) },
                      { label: "Furnished", value: label("furnished", home.furnished) },
                      { label: "Lease", value: label("lease", home.lease) },
                      { label: "Repairs", value: label("issueSpeed", home.issueSpeed) },
                      { label: "Biggest concern", value: label("concern", home.concern) },
                    ]}
                  />
                </div>
              </div>
            ) : null}

            {profile.expectations ? (
              <div className="mt-5">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-crimson">
                  In your own words
                </h3>
                <p className="mt-1.5 rounded-xl border border-line bg-[#fffafc] p-3 text-[13px] leading-relaxed">
                  {profile.expectations}
                </p>
              </div>
            ) : null}

            <div className="mt-5">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-crimson">
                Kept out of your score
              </h3>
              {profile.excluded.length ? (
                <ul className="mt-1.5 space-y-1">
                  {profile.excluded.map((item) => (
                    <li key={item} className="text-[13px] text-muted">
                      “{item}” <span className="chip chip-warn ml-1">never scored</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-[13px] text-muted">
                  Nothing stored. If you add a preference that touches a protected ground, Deservia
                  keeps it here as a note and never reads it when scoring, ranking or filtering.
                </p>
              )}
            </div>
          </section>

          {listing ? (
            <section className="card p-5">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                Your listing
              </h2>
              <div className="mt-2 flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-blush text-xl">
                  {listing.emoji}
                </span>
                <div>
                  <p className="text-[15px] font-extrabold">{listing.title}</p>
                  <p className="text-[13px] text-muted">
                    {listing.area} · {budgetLabel(listing.rent)}/mo ·{" "}
                    {label("spaceType", listing.spaceType)} · {label("lease", listing.lease)}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{listing.blurb}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {listing.amenities.map((item) => (
                  <span key={item} className="chip chip-muted">
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
              My account
            </h2>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-muted">Name</dt>
                <dd className="font-semibold">{profile.name}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-muted">Email</dt>
                <dd className="truncate font-semibold">{profile.email}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-muted">Role</dt>
                <dd className="font-semibold capitalize">
                  {profile.role === "admin" ? "Deservia admin" : profile.role}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-muted">18+ &amp; privacy consent</dt>
                <dd className="font-semibold">
                  {profile.consentAt
                    ? new Date(profile.consentAt).toLocaleDateString("en-CA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Recorded at sign-up"}
                </dd>
              </div>
            </dl>
            {profile.role === "landlord" ? (
              <Link to="/app/listing" className="btn btn-ghost btn-sm mt-3 w-full">
                Manage my listing
              </Link>
            ) : null}
            {profile.role !== "admin" ? (
              <Link to="/app/deck" className="btn btn-ghost btn-sm mt-2 w-full">
                Back to my matches
              </Link>
            ) : (
              <Link to="/app/admin" className="btn btn-ghost btn-sm mt-3 w-full">
                Back to oversight
              </Link>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Passwords are stored as salted hashes and are never shown to you or to Deservia staff.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
              Trust profile
            </h2>
            {trust.average ? (
              <>
                <div className="mt-2 flex items-end gap-3">
                  <span className="text-3xl font-extrabold">{trust.average}</span>
                  <div className="pb-1">
                    <Stars value={trust.average} />
                    <p className="text-[11.5px] text-muted">
                      {trust.count} completed {trust.count === 1 ? "rental" : "rentals"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {trust.tags.map((tag) => (
                    <span key={tag.tag} className="chip">
                      {tag.tag} ({tag.count})
                    </span>
                  ))}
                </div>
                <div className="mt-4 space-y-2.5">
                  {trust.reviews.map((review, index) => (
                    <div key={`${review.createdAt}-${index}`} className="rounded-xl border border-line p-2.5">
                      <div className="flex items-center justify-between">
                        <Stars value={review.stars} size={12} />
                        <span className="text-[11px] capitalize text-muted">
                          as {review.fromRole}
                        </span>
                      </div>
                      {review.tags.length ? (
                        <p className="mt-1 text-[11.5px] text-muted">
                          Notable: {review.tags.join(", ")}
                        </p>
                      ) : null}
                      {review.note ? (
                        <p className="mt-1 text-[12.5px] leading-relaxed">“{review.note}”</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                New profile. Ratings open after a completed rental — and they&apos;re about the
                transaction, never the person.
              </p>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              “Highly rated” is earned at 4.5★ from at least 5 completed rentals. A low star average
              alone never removes anyone.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
              Privacy
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Deservia holds no card numbers, bank details, credit reports or income documents. Data
              is archived or anonymized after a lease or 90 days of inactivity.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3 w-full"
              onClick={() => void download()}
              disabled={busy}
            >
              Download my data
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                className="mt-2 w-full text-[12px] font-semibold text-crimson underline decoration-crimson/30 underline-offset-2"
                onClick={() => setConfirmDelete(true)}
              >
                Delete my data
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-[#f1d58a] bg-[#fff7e6] p-3 text-[12.5px] text-[#8a5a00]">
                <p>
                  This removes your profile, matches, ratings you wrote and reports. It cannot be
                  undone.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void remove()}
                    disabled={busy}
                  >
                    Yes, delete everything
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {profile.role === "admin" ? (
              <p className="mt-3 text-[11.5px] text-muted">
                Admin account — moderation and appeals only.
              </p>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
              Your answers, in short
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                label("tidiness", lifestyle.tidiness),
                label("music", lifestyle.music),
                label("smoking", lifestyle.smoking),
                label("pets", lifestyle.pets),
                ...lifestyle.hobbies.map(hobbyLabel),
              ].map((chip) => (
                <span key={chip} className="chip chip-muted">
                  {chip}
                </span>
              ))}
            </div>
            <Link to="/app/deck" className="btn btn-ghost btn-sm mt-3 w-full">
              Back to my matches
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
