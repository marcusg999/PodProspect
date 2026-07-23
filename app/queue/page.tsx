"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { MatchWithPodcast } from "@/lib/types";

// View gate: the Approve button unlocks only after the reviewer has plausibly
// SEEN the pitch — the focus card open for this long, OR a scroll/focus on the
// body. Cheap friction so approval is never a reflex.
const VIEW_MS = 2000;

export default function QueuePage() {
  const [pending, setPending] = useState<MatchWithPodcast[]>([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // editable buffer for the open pitch
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [icebreaker, setIcebreaker] = useState("");

  // view-gate state
  const [viewed, setViewed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = pending[idx] || null;

  const loadApprovedCount = useCallback(async () => {
    const d = await fetch("/api/matches?status=approved").then((r) => r.json());
    setApprovedCount((d.matches || []).length);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch("/api/matches?status=drafted").then((r) => r.json());
    const rows: MatchWithPodcast[] = d.matches || [];
    setPending(rows);
    setIdx((i) => Math.min(i, Math.max(0, rows.length - 1)));
    setChecked(new Set());
    setLoading(false);
    loadApprovedCount();
  }, [loadApprovedCount]);

  useEffect(() => {
    load();
  }, [load]);

  // When the open pitch changes: load its buffer, reset the view gate.
  useEffect(() => {
    if (!current) return;
    setSubject(current.outreach?.subject ?? "");
    setBody(current.outreach?.body ?? "");
    setIcebreaker(current.outreach?.icebreaker ?? "");
    setViewed(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => markViewed(), VIEW_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const markViewed = useCallback(() => {
    setViewed(true);
    if (current) {
      fetch("/api/outreach", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: current.id, viewed: true }),
      }).catch(() => {});
    }
  }, [current]);

  const autosave = useCallback(async () => {
    if (!current) return;
    await fetch("/api/outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: current.id, subject, body, icebreaker }),
    });
  }, [current, subject, body, icebreaker]);

  const advance = () => {
    // After removing current from pending, index stays pointing at the next one.
    setPending((prev) => prev.filter((p) => p.id !== current?.id));
    setIdx((i) => Math.min(i, Math.max(0, pending.length - 2)));
  };

  // Approve ONLY the open pitch. No batch path exists anywhere in this UI.
  const approveOpen = async () => {
    if (!current || !viewed) return;
    await autosave();
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id, status: "approved" }),
    });
    setApprovedCount((c) => c + 1);
    advance();
  };

  const rejectOpen = async () => {
    if (!current) return;
    await autosave();
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id, status: "shortlisted" }),
    });
    advance();
  };

  // Bulk reject from the rail — multiple drafts back to 'shortlisted' at once.
  const rejectSelected = async () => {
    const ids = Array.from(checked);
    if (!ids.length) return;
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "shortlisted" }),
    });
    load();
  };

  // Keyboard: 'A' approves the OPEN pitch only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        approveOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, viewed, subject, body, icebreaker]);

  const anyChecked = checked.size > 0;
  // Export gate: any selection here is a 'drafted' (non-approved) row, so the
  // export button must be disabled whenever the selection is non-empty.
  const exportDisabled = anyChecked;

  const doExport = async () => {
    if (exportDisabled) return;
    const res = await fetch("/api/export", { method: "POST" });
    if (!res.ok) {
      alert("Export failed: " + (await res.text()));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "podprospect-instantly.csv";
    a.click();
    URL.revokeObjectURL(url);
    load();
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Approval Queue</h1>
        <div className="flex items-center gap-3">
          <Badge variant={pending.length ? "warning" : "muted"}>
            Pending review: {pending.length}
          </Badge>
          <Badge variant="success">Approved &amp; ready: {approvedCount}</Badge>
          <span title={exportDisabled ? "Only approved pitches export" : "Export approved pitches to Instantly CSV"}>
            <Button variant="outline" onClick={doExport} disabled={exportDisabled}>
              Export CSV
            </Button>
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading queue…</p>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-lg font-medium">Nothing to review</p>
            <p className="text-muted-foreground">
              {approvedCount} approved and ready to export.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* Queue rail */}
          <Card className="h-fit">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {pending.length} pending
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!anyChecked}
                  onClick={rejectSelected}
                >
                  Reject selected ({checked.size})
                </Button>
              </div>
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {pending.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                      i === idx ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                    onClick={() => setIdx(i)}
                  >
                    <Checkbox
                      checked={checked.has(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="truncate flex-1">{p.podcast.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.relevance_score ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Focus view */}
          {current && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="text-xs text-muted-foreground">
                  {idx + 1} of {pending.length} pending review
                </div>

                <div className="flex items-start gap-4">
                  {current.podcast.artwork_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.podcast.artwork_url}
                      alt=""
                      className="w-20 h-20 rounded-md object-cover"
                    />
                  )}
                  <div>
                    <h2 className="text-lg font-semibold">{current.podcast.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      To: {current.podcast.owner_email || "— no email —"}
                    </p>
                    {current.podcast.owner_email ? null : (
                      <Badge variant="warning" className="mt-1">no email — won't export</Badge>
                    )}
                  </div>
                </div>

                {current.outreach?.detail_cited && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <span className="font-medium">Cites this show detail: </span>
                    {current.outreach.detail_cited}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Subject</label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={autosave} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Body</label>
                  <Textarea
                    rows={12}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onScroll={markViewed}
                    onFocus={markViewed}
                    onBlur={autosave}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Icebreaker (Instantly {"{{icebreaker}}"})</label>
                  <Textarea
                    rows={2}
                    value={icebreaker}
                    onChange={(e) => setIcebreaker(e.target.value)}
                    onBlur={autosave}
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <span title={viewed ? "" : "Read the pitch first — Approve unlocks after ~2s or once you scroll the body"}>
                    <Button onClick={approveOpen} disabled={!viewed}>
                      {viewed ? "Approve (A)" : "Approve — reading…"}
                    </Button>
                  </span>
                  <Button variant="outline" onClick={rejectOpen}>
                    Reject
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Edits autosave · approving advances to the next pitch
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
