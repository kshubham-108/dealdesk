"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  sender: "buyer_agent" | "seller" | "system";
  body: string;
  price: number | null;
  created_at: string;
};

export default function Chat({ listingId, huntId }: { listingId: string; huntId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const url = huntId
        ? `/api/market/${listingId}/messages?hunt=${huntId}`
        : `/api/market/${listingId}/messages`;
      const res = await fetch(url);
      if (cancelled || !res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      setTyping(!!data.typing);
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [listingId, huntId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!input.trim() || !huntId || sending) return;
    setSending(true);
    const body = input;
    setInput("");
    try {
      const res = await fetch(`/api/market/${listingId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hunt_id: huntId, body }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-80 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.sender === "buyer_agent"
                ? "self-end bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "self-start bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }`}
          >
            {m.body}
          </div>
        ))}
        {typing && (
          <div className="self-start rounded-lg bg-zinc-100 px-3 py-2 text-sm italic text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {huntId ? (
        <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <textarea
            id="message-input"
            aria-label="Message seller"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            id="send-button"
            type="button"
            onClick={send}
            disabled={sending || !input.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Send
          </button>
        </div>
      ) : (
        <p className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Read-only preview — open this listing from a hunt to chat.
        </p>
      )}
    </div>
  );
}
