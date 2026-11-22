import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How does this work?",
  "Show my liked listings",
  "Compare my liked listings",
  "How do I add a listing?",
];

const WELCOME =
  "Hi! I'm the Deservia assistant. I can explain how matching, viewing and listings work, and read the listings you're allowed to see. I can't change anything for you.";

/**
 * Floating Claude assistant. Renders nothing unless /api/chatbot/status says the
 * feature is switched on with CHATBOT_ENABLED. Sits above the app's built-in
 * keyword assistant so neither button covers the other.
 */
export function Chatbot() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    api<{ enabled: boolean }>("/api/chatbot/status")
      .then((data) => {
        if (live) setEnabled(data.enabled === true);
      })
      .catch(() => {
        if (live) setEnabled(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [turns, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = turns;
    setTurns([...history, { role: "user", content: message }]);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const data = await api<{ reply: string; unavailable?: boolean }>("/api/chatbot", {
        method: "POST",
        body: JSON.stringify({ message, history }),
      });
      setTurns((current) => [...current, { role: "assistant", content: data.reply }]);
      if (data.unavailable) setError("The assistant is having a moment. Nothing else is affected.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    setTurns([]);
    setInput("");
    setError(null);
    inputRef.current?.focus();
  }

  if (!enabled) return null;

  return (
    <div className="fixed bottom-[4.75rem] right-4 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="pop-in flex max-h-[70vh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-lift">
          <div className="flex items-center gap-2.5 bg-navy px-4 py-3 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15" aria-hidden>
              🤖
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[13.5px] font-bold">Deservia AI</p>
              <p className="text-[10.5px] text-white/60">Read-only assistant</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={newChat}
                className="rounded-full px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/10 hover:text-white"
              >
                New chat
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close AI assistant"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={bodyRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-[#fffafc] px-3 py-2">
              <p className="text-[12.5px] leading-relaxed text-ink/90">{WELCOME}</p>
            </div>
            {turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                className={
                  turn.role === "user"
                    ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-3 py-2 text-[12.5px] text-white"
                    : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-[#fffafc] px-3 py-2 text-[12.5px] leading-relaxed text-ink/90"
                }
              >
                {turn.content}
              </div>
            ))}
            {busy ? (
              <p className="flex items-center gap-1.5 text-[12px] text-muted" role="status">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-crimson" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-crimson [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-crimson [animation-delay:240ms]" />
                Thinking…
              </p>
            ) : null}
            {error ? (
              <p className="rounded-xl bg-blush px-3 py-2 text-[12px] font-semibold text-crimson">
                {error}
              </p>
            ) : null}
          </div>

          {turns.length === 0 ? (
            <div className="flex flex-wrap gap-1.5 border-t border-line px-3 pt-2.5">
              {SUGGESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void send(question)}
                  disabled={busy}
                  className="chip chip-muted hover:border-pink/40 hover:text-crimson"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="flex items-center gap-2 px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              ref={inputRef}
              className="input !rounded-full !py-2 !text-[13px]"
              placeholder="Ask about listings or the app…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={2000}
              aria-label="Ask the Deservia AI assistant"
            />
            <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
          <p className="px-3 pb-2.5 text-[10.5px] leading-relaxed text-muted">
            Answers use only your own listings and this app's features. 30 messages an hour.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-crimson to-pink text-[18px] text-white shadow-lift transition hover:brightness-105"
        aria-expanded={open}
        aria-label={open ? "Close the AI assistant" : "Open the AI assistant"}
      >
        <span aria-hidden>{open ? "✕" : "🤖"}</span>
      </button>
    </div>
  );
}
