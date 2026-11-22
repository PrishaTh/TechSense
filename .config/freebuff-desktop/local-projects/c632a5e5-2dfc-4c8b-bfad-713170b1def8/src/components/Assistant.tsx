import { useEffect, useRef, useState } from "react";
import { useChat } from "../lib/chat";

const generalQuick = ["How does it work?", "Pricing", "How does matching work?", "Privacy"];

const listingQuick = [
  "Is parking included?",
  "What's included in rent?",
  "How far is downtown?",
  "Why is this a good match for me?",
];

export function Assistant() {
  const { open, setOpen, attachment, messages, ask, removeAttachment, busy, error } = useChat();
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const quick = attachment ? listingQuick : generalQuick;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="pop-in flex max-h-[72vh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-lift">
          <div className="flex items-center gap-2.5 bg-navy px-4 py-3 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15" aria-hidden>
              💬
            </span>
            <div className="leading-tight">
              <p className="text-[13.5px] font-bold">Deservia Assistant</p>
              <p className="text-[10.5px] text-white/60">Answers built into this app</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto grid h-7 w-7 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Close assistant"
            >
              ✕
            </button>
          </div>

          {attachment ? (
            <div className="flex items-center gap-2 border-b border-line bg-[#fffafc] px-3 py-2">
              <span className="min-w-0 flex-1 truncate rounded-full bg-blush px-2.5 py-1 text-[11.5px] font-semibold text-crimson">
                Attached: {attachment.title} · {attachment.bedrooms === 0 ? "Studio" : `${attachment.bedrooms} bed`} · {attachment.area}
              </span>
              <button
                type="button"
                onClick={removeAttachment}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-white text-[11px] text-muted hover:text-crimson"
                aria-label="Remove attached listing"
              >
                ✕
              </button>
            </div>
          ) : null}

          <div ref={bodyRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.from === "me"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3 py-2 text-[12.5px] text-white"
                    : "max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-[#fffafc] px-3 py-2"
                }
              >
                {message.attachment ? (
                  <p
                    className={`mb-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold ${
                      message.from === "me"
                        ? "bg-white/15 text-white"
                        : "bg-blush text-crimson"
                    }`}
                  >
                    📎 {message.attachment}
                  </p>
                ) : null}
                {message.title ? (
                  <p className="text-[12px] font-extrabold text-crimson">{message.title}</p>
                ) : null}
                {message.text ? (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink/90">{message.text}</p>
                ) : null}
              </div>
            ))}
            {busy ? (
              <p className="text-[12px] text-muted" role="status">
                Fetching the listing…
              </p>
            ) : null}
            {error ? (
              <p className="rounded-xl bg-blush px-3 py-2 text-[12px] font-semibold text-crimson">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-line px-3 pt-2.5">
            {quick.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => ask(question)}
                className="chip chip-muted hover:border-pink/40 hover:text-crimson"
              >
                {question}
              </button>
            ))}
          </div>

          <form
            className="flex items-center gap-2 px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
              setInput("");
            }}
          >
            <input
              className="input !rounded-full !py-2 !text-[13px]"
              placeholder={attachment ? "Ask about this listing…" : "Ask about matching, pricing…"}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-label="Ask the Deservia assistant"
            />
            <button type="submit" className="btn btn-primary btn-sm shrink-0">
              Send
            </button>
          </form>
          <p className="px-3 pb-2.5 text-[10.5px] leading-relaxed text-muted">
            {attachment
              ? "Answers use only this listing's saved details. If something isn't listed, ask the landlord."
              : "Free to ask. No account needed for the assistant."}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full bg-gradient-to-br from-crimson to-pink px-4 py-3 text-[13px] font-bold text-white shadow-lift"
        aria-expanded={open}
        aria-label={open ? "Close the Deservia assistant" : "Open the Deservia assistant"}
      >
        <span aria-hidden>{open ? "✕" : "💬"}</span>
        {open ? "Close" : "Ask Deservia"}
      </button>
    </div>
  );
}
