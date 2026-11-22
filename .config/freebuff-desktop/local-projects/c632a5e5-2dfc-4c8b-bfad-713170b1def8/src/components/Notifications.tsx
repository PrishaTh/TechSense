import { useEffect, useState } from "react";
import type { AppNotification } from "../../shared/types";
import { api } from "../lib/api";

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Notifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((item) => !item.readAt).length;

  async function load() {
    try {
      const result = await api<{ items: AppNotification[] }>("/api/notifications");
      setItems(result.items);
    } catch {
      /* the bell simply stays empty */
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function markAll() {
    try {
      await api("/api/notifications/read", { method: "POST", body: JSON.stringify({}) });
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-white/25 text-[14px] text-white/85 hover:border-white/50 hover:text-white"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        🔔
        {unread ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink2 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
              Notifications
            </p>
            {unread ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-[11.5px] font-bold text-crimson"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {items.length ? (
              items.map((item) => (
                <a
                  key={item.id}
                  href={item.link ?? "/app/matches"}
                  className={`block border-b border-line/60 px-3 py-2.5 text-[12.5px] leading-relaxed hover:bg-mist ${
                    item.readAt ? "text-muted" : "font-semibold"
                  }`}
                >
                  <p>{item.body}</p>
                  <p className="mt-0.5 text-[10.5px] font-normal text-muted">{when(item.createdAt)}</p>
                </a>
              ))
            ) : (
              <p className="px-3 py-4 text-[12.5px] text-muted">
                Nothing yet. Matches, applications and viewings show up here.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
