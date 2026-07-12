"use client";

import { useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const EXAMPLES = [
  "How far is the fire extinguisher from the server rack?",
  "What's open in Room 101?",
  "How do I get from the fire extinguisher to Room 101?",
];

const FLOORS_LINK_RE = /\/floors\/[^\s)]+/g;

/** Render answer text with any /floors/… route URL as a clickable link. */
function MessageText({ text }: { text: string }) {
  const pieces = text.split(FLOORS_LINK_RE);
  const links = text.match(FLOORS_LINK_RE) ?? [];
  return (
    <>
      {pieces.map((piece, i) => (
        <span key={i}>
          {piece}
          {links[i] && (
            <Link
              href={links[i]}
              className="underline text-[var(--color-ink)] hover:text-[var(--color-signal)]"
            >
              View route
            </Link>
          )}
        </span>
      ))}
    </>
  );
}

export function AskPanel({ facilityId }: { facilityId: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: `/api/facilities/${facilityId}/chat` }),
  });

  const busy = status === "submitted" || status === "streaming";

  function ask(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="w-full">
      <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
        Ask about this Facility
      </h2>

      <div className="mt-2 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-[var(--color-ink-soft)]">
              Ask a spatial or status question — answered from live PostGIS data, not a guess.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => ask(ex)}
                  className="rounded-sm border border-[var(--color-grid)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-h-72 space-y-4 overflow-y-auto">
            {messages.map((message) => {
              const text = message.parts
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("");
              const isUser = message.role === "user";
              return (
                <div key={message.id}>
                  <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                    {isUser ? "You" : "Answer"}
                  </span>
                  <p className="mt-0.5 text-sm text-[var(--color-ink)]">
                    <MessageText text={text} />
                  </p>
                  {!isUser && text && (
                    <p className="mt-1 font-mono text-xs text-[var(--color-ink-soft)]">
                      ⌐ computed from live PostGIS data
                    </p>
                  )}
                </div>
              );
            })}
            {busy && (
              <p className="font-mono text-xs text-[var(--color-ink-soft)]">
                querying the Floor Plan…
              </p>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mt-3 flex gap-2 border-t border-[var(--color-grid)] pt-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={busy}
            className="flex-1 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-sm bg-[var(--color-ink)] px-3 py-1.5 font-mono text-xs text-[var(--color-paper)] disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
