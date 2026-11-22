import type { ReactNode } from "react";
import { accentStyle } from "../lib/ui";

export function Avatar({
  emoji,
  accent,
  size = 52,
}: {
  emoji: string;
  accent: string;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl text-white"
      style={{ ...accentStyle(accent), width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      {emoji || "🏠"}
    </div>
  );
}

export function ScoreRing({ score, size = 68 }: { score: number; size?: number }) {
  const color = score >= 90 ? "#e5197d" : score >= 75 ? "#a4123f" : "#6a6a88";
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${score * 3.6}deg, #f6e3ed 0deg)`,
      }}
      role="img"
      aria-label={`${score} percent match`}
    >
      <div
        className="grid place-items-center rounded-full bg-white"
        style={{ width: size - 11, height: size - 11 }}
      >
        <span className="font-extrabold leading-none" style={{ fontSize: size * 0.26, color }}>
          {score}%
        </span>
      </div>
    </div>
  );
}

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#e0a800]" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <span key={index} style={{ fontSize: size, opacity: index <= Math.round(value) ? 1 : 0.25 }}>
          ★
        </span>
      ))}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-pink" />
      {label ?? "Loading…"}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "ok";
  children: ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "bg-[#fff7e6] border-[#f1d58a] text-[#8a5a00]"
      : tone === "ok"
        ? "bg-[#f2fbf7] border-[#bfe6d4] text-[#166534]"
        : "bg-white/60 border-line text-muted";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-[13.5px] leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-10 text-center">
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <h3 className="text-base font-bold">{title}</h3>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h2 className="section-title">{title}</h2>
        {children ? <p className="mt-2 max-w-2xl text-sm text-muted">{children}</p> : null}
      </div>
    </div>
  );
}
