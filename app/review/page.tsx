"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate } from "@/lib/utils";
import type { MatchWithPodcast, MatchStatus } from "@/lib/types";

const STATUSES: MatchStatus[] = [
  "new", "shortlisted", "drafted", "approved", "exported", "replied", "booked", "passed",
];

export default function ReviewPage() {
  const [rows, setRows] = useState<MatchWithPodcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEmail, setHasEmail] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<MatchWithPodcast | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (hasEmail) p.set("hasEmail", "true");
    if (activeOnly) p.set("activeOnly", "true");
    if (minScore) p.set("minScore", String(minScore));
    if (status) p.set("status", status);
    const d = await fetch(`/api/matches?${p}`).then((r) => r.json());
    setRows(d.matches || []);
    setLoading(false);
  }, [hasEmail, activeOnly, minScore, status]);

  useEffect(() => {
    load();
  }, [load]);

  const setRowStatus = async (id: string, s: MatchStatus) => {
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: s }),
    });
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review</h1>
          <p className="text-muted-foreground text-sm">
            Ranked by fit score. Shortlist strong shows; pass the rest.
          </p>
        </div>
        <Badge variant="muted">{rows.length} shows</Badge>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hasEmail} onChange={(e) => setHasEmail(e.target.checked)} />
            Has email
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <label className="flex items-center gap-2 text-sm">
            Min score
            <Input
              type="number"
              className="w-20"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value || "0", 10))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Status
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Score</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Categories</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Active</th>
                  <th className="p-3">Last episode</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No shows yet — run Search → Enrich → Score from the dashboard.
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 hover:bg-accent/50 cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <td className="p-3 font-semibold">{r.relevance_score ?? "—"}</td>
                    <td className="p-3 max-w-xs truncate">{r.podcast.title}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[12rem] truncate">
                      {r.podcast.categories?.slice(0, 3).join(", ")}
                    </td>
                    <td className="p-3">
                      {r.podcast.owner_email ? (
                        <Badge variant="success">email</Badge>
                      ) : (
                        <Badge variant="muted">no email</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {r.podcast.active ? (
                        <Badge variant="success">active</Badge>
                      ) : (
                        <Badge variant="muted">dormant</Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs">{fmtDate(r.podcast.last_episode_at)}</td>
                    <td className="p-3"><Badge variant="outline">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Drawer
          row={selected}
          onClose={() => setSelected(null)}
          onShortlist={() => setRowStatus(selected.id, "shortlisted")}
          onPass={() => setRowStatus(selected.id, "passed")}
        />
      )}
    </div>
  );
}

function Drawer({
  row, onClose, onShortlist, onPass,
}: {
  row: MatchWithPodcast;
  onClose: () => void;
  onShortlist: () => void;
  onPass: () => void;
}) {
  const p = row.podcast;
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-border overflow-y-auto p-6 space-y-4">
        <div className="flex items-start gap-3">
          {p.artwork_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.artwork_url} alt="" className="w-16 h-16 rounded-md object-cover" />
          )}
          <div>
            <h2 className="font-semibold leading-tight">{p.title}</h2>
            <p className="text-xs text-muted-foreground">
              Score {row.relevance_score ?? "—"} · {row.status}
            </p>
          </div>
        </div>

        {row.reasoning && (
          <p className="text-sm italic text-muted-foreground">“{row.reasoning}”</p>
        )}

        <div className="flex flex-wrap gap-2">
          {p.active ? <Badge variant="success">active</Badge> : <Badge variant="muted">dormant</Badge>}
          {p.owner_email ? <Badge variant="success">email</Badge> : <Badge variant="muted">no email</Badge>}
          {p.categories?.slice(0, 4).map((c) => (
            <Badge key={c} variant="outline">{c}</Badge>
          ))}
        </div>

        <div className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Owner:</span> {p.owner_name || "—"}</div>
          <div>
            <span className="text-muted-foreground">Email:</span>{" "}
            {p.owner_email || <span className="text-muted-foreground">none (Firecrawl fallback / manual)</span>}
          </div>
          <div><span className="text-muted-foreground">Last episode:</span> {fmtDate(p.last_episode_at)}</div>
          <div><span className="text-muted-foreground">Episodes:</span> {p.episode_count ?? "—"}</div>
          <div className="truncate">
            <span className="text-muted-foreground">Feed:</span>{" "}
            <a href={p.feed_url} target="_blank" className="text-primary underline">{p.feed_url}</a>
          </div>
          {p.website && (
            <div className="truncate">
              <span className="text-muted-foreground">Website:</span>{" "}
              <a href={p.website} target="_blank" className="text-primary underline">{p.website}</a>
            </div>
          )}
        </div>

        {p.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>
        )}

        {p.recent_episode_titles?.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-1">Recent episodes</h3>
            <ul className="text-sm list-disc pl-5 space-y-0.5 text-muted-foreground">
              {p.recent_episode_titles.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={onShortlist}>Shortlist</Button>
          <Button variant="outline" className="flex-1" onClick={onPass}>Pass</Button>
        </div>
      </div>
    </div>
  );
}
