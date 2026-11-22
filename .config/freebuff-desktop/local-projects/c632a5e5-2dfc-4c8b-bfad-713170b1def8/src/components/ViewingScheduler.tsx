import { useEffect, useMemo, useState } from "react";
import type { ViewingState } from "../../shared/types";
import { Notice, Spinner } from "./ui";
import { api, errorMessage } from "../lib/api";
import { useAsync } from "../lib/ui";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 30-minute viewing ranges, 12:00 PM to 6:00 PM local time. */
function startMinutes(): number[] {
  const out: number[] = [];
  for (let minutes = 12 * 60; minutes <= 17 * 60 + 30; minutes += 30) out.push(minutes);
  return out;
}

function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function keyOf(iso: string): string {
  return dateKey(new Date(iso));
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

/** "9:00–9:30 AM", "11:30 AM–12:00 PM". */
function rangeLabel(startUtc: string): string {
  const start = new Date(startUtc);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const startText = timeLabel(start);
  const endText = timeLabel(end);
  const samePeriod = startText.slice(-2) === endText.slice(-2);
  return samePeriod
    ? `${startText.replace(/\s?[AP]M$/, "")}–${endText}`
    : `${startText}–${endText}`;
}

function longDate(startUtc: string): string {
  return new Date(startUtc).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function icsHref(state: ViewingState, startUtc: string): string {
  const start = new Date(startUtc);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (date: Date) => `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const location = state.listingAddress || state.listingArea;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Deservia//Viewing//EN",
    "BEGIN:VEVENT",
    `UID:${startUtc}-${state.listingTitle.replace(/\s+/g, "-")}@deservia`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Viewing — ${state.listingTitle}`,
    `LOCATION:${location.replace(/,/g, "\\,")}`,
    `DESCRIPTION:In-person tour with ${state.otherName}.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
  rescheduled: "Reschedule proposed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function ViewingScheduler({
  matchId,
  onChanged,
}: {
  matchId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const { data, loading, error: loadError, reload } = useAsync<ViewingState>(
    () => api<ViewingState>(`/api/matches/${matchId}/viewing`),
    [matchId],
  );
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pickedSlot, setPickedSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (data?.viewing) setExpanded(true);
  }, [data?.viewing?.id]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await reload();
      if (onChanged) await onChanged();
      if (done) setMessage(done);
      setPickedSlot("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const grid = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const days = new Date(month.year, month.month + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let day = 1; day <= days; day += 1) {
      cells.push(new Date(month.year, month.month, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  if (loading) return <Spinner label="Loading the viewing calendar…" />;
  if (loadError || !data) {
    return <Notice tone="warn">{loadError ?? "Could not load the viewing calendar."}</Notice>;
  }

  const viewing = data.viewing;
  // `theirs` is always the landlord's availability on the server.
  const landlordSlots = data.theirs;
  const openSlots = data.overlap;
  const openByDate = new Map<string, string[]>();
  for (const slot of openSlots) {
    const key = keyOf(slot);
    openByDate.set(key, [...(openByDate.get(key) ?? []), slot].sort());
  }
  const availabilityByDate = new Map<string, string[]>();
  for (const slot of landlordSlots) {
    const key = keyOf(slot);
    availabilityByDate.set(key, [...(availabilityByDate.get(key) ?? []), slot].sort());
  }

  const todayKey = dateKey(today);
  const pickedDate = selectedDate ? new Date(`${selectedDate}T12:00:00`) : null;
  const dateOpen = selectedDate ? openByDate.get(selectedDate) ?? [] : [];
  const dateMine = selectedDate ? availabilityByDate.get(selectedDate) ?? [] : [];

  // Landlord: the 30-minute ranges that can be added on the picked date.
  const addable = pickedDate
    ? startMinutes()
        .map((minutes) => {
          const at = new Date(
            pickedDate.getFullYear(),
            pickedDate.getMonth(),
            pickedDate.getDate(),
            Math.floor(minutes / 60),
            minutes % 60,
            0,
            0,
          );
          return at;
        })
        .filter((at) => at.getTime() > Date.now())
        .map((at) => at)
        .filter((at) => !dateMine.includes(at.toISOString()))
    : [];

  const active = viewing && ["proposed", "confirmed", "rescheduled"].includes(viewing.status);
  const canSetAvailability = data.iAmTenant ? false : true;

  function shiftMonth(delta: number) {
    setMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    setSelectedDate(null);
    setPickedSlot("");
  }

  function selectDate(date: Date) {
    const key = dateKey(date);
    if (key < todayKey) return;
    if (data?.iAmTenant && !openByDate.has(key)) return;
    setSelectedDate(key);
    setPickedSlot("");
  }

  function saveAvailability(slots: string[], done: string) {
    void run(
      () =>
        api(`/api/matches/${matchId}/viewing/availability`, {
          method: "POST",
          body: JSON.stringify({ slots }),
        }),
      done,
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-crimson">
            Schedule a viewing
          </p>
          <p className="text-[12.5px] text-muted">
            In person with {data.otherName} · {data.listingAddress || data.listingArea}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewing ? <span className="chip chip-muted">{STATUS_LABEL[viewing.status]}</span> : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide calendar" : "Open the calendar"}
          </button>
        </div>
      </div>

      <div className={expanded ? "" : "hidden"}>
        {active && viewing ? (
          <div
            className={`mt-3 rounded-xl border px-3.5 py-3 text-[13px] ${
              viewing.status === "confirmed"
                ? "border-[#bfe6d4] bg-[#f2fbf7] text-[#166534]"
                : "border-[#f1d58a] bg-[#fff7e6] text-[#8a5a00]"
            }`}
          >
            <p className="font-bold">
              {viewing.status === "confirmed" ? "Viewing confirmed" : "Waiting for a confirmation"}
            </p>
            <p className="mt-0.5">
              {longDate(viewing.startUtc)} · {rangeLabel(viewing.startUtc)}
            </p>
            <p className="mt-0.5 text-[12px]">
              {data.listingTitle} · {data.listingAddress || data.listingArea} · with {data.otherName}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {viewing.status === "confirmed" ? (
                <>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={icsHref(data, viewing.startUtc)}
                    download="deservia-viewing.ics"
                  >
                    Add to calendar (.ics)
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api(`/api/matches/${matchId}/viewing/complete`, { method: "POST" }),
                      )
                    }
                  >
                    Mark completed
                  </button>
                </>
              ) : viewing.proposedBy !== data.myId ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api(`/api/matches/${matchId}/viewing/confirm`, { method: "POST" }),
                      "Viewing confirmed.",
                    )
                  }
                >
                  Confirm this time
                </button>
              ) : null}
              <button
                type="button"
                className="text-[12px] font-semibold text-muted hover:text-crimson"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api(`/api/matches/${matchId}/viewing/cancel`, { method: "POST" }),
                    "Viewing cancelled.",
                  )
                }
              >
                Cancel
              </button>
            </div>
            {viewing.status === "proposed" || viewing.status === "rescheduled" ? (
              <p className="mt-1.5 text-[11.5px]">
                {viewing.proposedBy !== data.myId
                  ? "Confirm it, or pick another date and range below to send it back."
                  : `Waiting for ${data.otherName} to confirm. You can pick another date and range below.`}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            ←
          </button>
          <p className="text-[13.5px] font-extrabold">
            {MONTH_LABELS[month.month]} {month.year}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
          {DAY_LABELS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((date, index) => {
            if (!date) return <span key={`blank-${index}`} />;
            const key = dateKey(date);
            const past = key < todayKey;
            const open = openByDate.has(key);
            const openAvailable = open && (openByDate.get(key) ?? []).length > 0;
            const hasAvailability = availabilityByDate.has(key);
            const selectable = data.iAmTenant ? !past && openAvailable : !past;
            const selected = key === selectedDate;
            const bookedOut = hasAvailability && !open;
            return (
              <button
                key={key}
                type="button"
                disabled={!selectable || busy}
                onClick={() => selectDate(date)}
                aria-label={`${longDate(
                  new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString(),
                )}${openAvailable ? " — open times" : ""}`}
                aria-pressed={selected}
                className={`relative grid h-9 place-items-center rounded-lg text-[12px] font-bold transition ${
                  selected
                    ? "bg-gradient-to-br from-crimson to-pink text-white"
                    : selectable
                      ? openAvailable || hasAvailability
                        ? "border border-[#bfe6d4] bg-[#f2fbf7] text-[#166534] hover:border-[#166534]"
                        : "border border-line bg-white text-ink hover:border-pink/50"
                      : "text-muted/40"
                }`}
              >
                {date.getDate()}
                {bookedOut && !selected ? (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#e0a800]" />
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="mt-1.5 text-[11px] text-muted">
          {data.iAmTenant
            ? "Green dates have open viewing times. Past dates and dates without availability can't be selected."
            : "Pick a date to add 30-minute viewing ranges. Green dates already have availability."}
        </p>

        {selectedDate && pickedDate ? (
          <div className="mt-3 rounded-xl border border-line bg-[#fffafc] p-3">
            <p className="text-[12.5px] font-bold">{longDate(pickedDate.toISOString())}</p>

            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[220px] flex-1">
                <span className="field-label">
                  {data.iAmTenant ? "Open time ranges" : "Add a time range"}
                </span>
                <select
                  className="select"
                  value={pickedSlot}
                  onChange={(event) => setPickedSlot(event.target.value)}
                  disabled={busy}
                >
                  <option value="">
                    {data.iAmTenant
                      ? dateOpen.length
                        ? "Choose a time range…"
                        : "No open times on this date"
                      : addable.length
                        ? "Choose a time range…"
                        : "Every range on this date is already added"
                    }
                  </option>
                  {(data.iAmTenant ? dateOpen : addable.map((at) => at.toISOString())).map(
                    (iso) => (
                      <option key={iso} value={iso}>
                        {rangeLabel(iso)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {data.iAmTenant ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !pickedSlot}
                  onClick={() =>
                    void run(
                      () =>
                        api(`/api/matches/${matchId}/viewing/propose`, {
                          method: "POST",
                          body: JSON.stringify({ at: pickedSlot }),
                        }),
                      "Viewing requested. The landlord confirms it.",
                    )
                  }
                >
                  Request this time
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !pickedSlot}
                  onClick={() =>
                    saveAvailability(
                      [...new Set([...landlordSlots, pickedSlot])].sort(),
                      "Time range added.",
                    )
                  }
                >
                  Add this range
                </button>
              )}
            </div>

            {data.iAmTenant ? null : (
              <div className="mt-3">
                <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                  Ranges on this date
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {dateMine.length ? (
                    dateMine.map((iso) => (
                      <span
                        key={iso}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                          data.busyForLandlord.includes(iso)
                            ? "border-[#f1d58a] bg-[#fff7e6] text-[#8a5a00]"
                            : "border-[#bfe6d4] bg-[#f2fbf7] text-[#166534]"
                        }`}
                      >
                        {rangeLabel(iso)}
                        {data.busyForLandlord.includes(iso) ? " · booked" : ""}
                        <button
                          type="button"
                          className="text-[11px] opacity-70 hover:opacity-100"
                          disabled={busy}
                          aria-label={`Remove ${rangeLabel(iso)}`}
                          onClick={() =>
                            saveAvailability(
                              landlordSlots.filter((slot) => slot !== iso),
                              "Time range removed.",
                            )
                          }
                        >
                          ✕
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-[12px] text-muted">No ranges added yet.</span>
                  )}
                </div>
              </div>
            )}

            {data.iAmTenant && !dateOpen.length ? (
              <p className="mt-2 text-[11.5px] text-muted">
                The landlord has no open ranges left on this date.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-3 text-[12px] text-muted">
            {data.iAmTenant
              ? "Pick a green date to see the landlord's open time ranges."
              : "Pick a date to add viewing ranges for this tenant."}
          </p>
        )}

        {canSetAvailability && !landlordSlots.length ? (
          <p className="mt-2 text-[11.5px] text-muted">
            No availability yet. The tenant can only book a range you add here.
          </p>
        ) : null}

        {error ? (
          <p className="mt-2 rounded-xl bg-blush px-3 py-2 text-[12px] font-semibold text-crimson">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-2 rounded-xl bg-[#f2fbf7] px-3 py-2 text-[12px] font-semibold text-[#166534]">
            {message}
          </p>
        ) : null}

        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Times are stored in UTC and shown in your local time zone (America/Toronto by default).
          Booked ranges are removed for everyone else.
        </p>
      </div>
    </div>
  );
}
