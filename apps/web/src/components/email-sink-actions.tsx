"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CornerUpLeft, Loader2, ShieldOff, Undo2 } from "lucide-react";
import { Button } from "@navo/ui";

export function EmailSinkActions({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("Yes, this is relevant. Can we discuss it next Tuesday?");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const send = async (event: "reply" | "bounce" | "unsubscribe" | "complaint") => {
    setBusy(event);
    setResult(null);
    const response = await fetch(`/api/dev/email-sink/${messageId}/${event}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event === "reply" ? { body } : { body: event === "bounce" ? "Delivery failed: mailbox unavailable." : undefined }),
    });
    const payload = await response.json();
    setResult(response.ok ? `${payload.data.classification?.classification ?? event.toUpperCase()} · reply loop completed` : payload.error?.message ?? "Simulation failed");
    setBusy(null);
    router.refresh();
  };

  return <div className="stack" style={{ gap: 10 }}>
    <textarea className="input" style={{ minHeight: 88, padding: 10, resize: "vertical" }} value={body} onChange={(event) => setBody(event.target.value)} aria-label="Simulated reply body" />
    <div className="toolbar-group" style={{ flexWrap: "wrap" }}>
      <Button onClick={() => send("reply")} disabled={Boolean(busy)}>{busy === "reply" ? <Loader2 size={14} /> : <CornerUpLeft size={14} />}Simulate reply</Button>
      <Button variant="secondary" onClick={() => send("bounce")} disabled={Boolean(busy)}><Undo2 size={14} />Bounce</Button>
      <Button variant="secondary" onClick={() => send("unsubscribe")} disabled={Boolean(busy)}><ShieldOff size={14} />Unsubscribe</Button>
      <Button variant="secondary" onClick={() => send("complaint")} disabled={Boolean(busy)}><AlertTriangle size={14} />Complaint</Button>
    </div>
    {result && <div className="alert alert-info" role="status">{result}</div>}
  </div>;
}
