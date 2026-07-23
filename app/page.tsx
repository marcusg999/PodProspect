"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HealthResp {
  ok: boolean;
  pending_review: number;
  checks: { id: string; label: string; pass: boolean; detail: string }[];
}

async function post(url: string, body?: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const refresh = async () => {
    const res = await fetch("/api/health").then((r) => r.json());
    setHealth(res);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const run = async (step: string, url: string, body?: any) => {
    setBusy(step);
    setLog((l) => [`▶ ${step}…`, ...l]);
    try {
      const res = await post(url, body);
      setLog((l) => [`✔ ${step}: ${JSON.stringify(res).slice(0, 160)}`, ...l]);
      await refresh();
    } catch (e: any) {
      setLog((l) => [`✖ ${step}: ${e.message}`, ...l]);
    } finally {
      setBusy(null);
    }
  };

  const steps = [
    { key: "search", label: "1. Search", desc: "Podcast Index + iTunes for every keyword", url: "/api/search" },
    { key: "enrich", label: "2. Enrich", desc: "Parse RSS owner email; Firecrawl fallback (8/run)", url: "/api/enrich", body: { limit: 8 } },
    { key: "score", label: "3. Score", desc: "Haiku scores active shows for fit (10/run)", url: "/api/score", body: { limit: 10 } },
    { key: "draft", label: "4. Draft shortlisted", desc: "Sonnet drafts pitches for shortlisted", url: "/api/draft", body: { all: true } },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            The Physics of Hip-Hop — guest-booking pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/queue">
            <Badge variant={health?.pending_review ? "warning" : "muted"}>
              Pending review: {health?.pending_review ?? "…"}
            </Badge>
          </Link>
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="text-base">{s.label}</CardTitle>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                disabled={!!busy}
                onClick={() => run(s.label, s.url, s.body)}
              >
                {busy === s.label ? "Running…" : "Run"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <Link href="/review" className="text-primary underline">
                Review &amp; shortlist
              </Link>{" "}
              scored shows, then draft pitches.
            </p>
            <p>
              <Link href="/queue" className="text-primary underline">
                Approval queue
              </Link>{" "}
              — read each pitch and approve one at a time.
            </p>
            <p>
              Export approved pitches to an Instantly-ready CSV from the queue.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs font-mono space-y-1 max-h-56 overflow-auto">
              {log.length === 0 && (
                <p className="text-muted-foreground">No activity yet.</p>
              )}
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Health checks
              <Badge variant={health.ok ? "success" : "warning"}>
                {health.ok ? "all passing" : "attention"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.checks.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-sm">
                <span>{c.pass ? "✅" : "⚠️"}</span>
                <div>
                  <div>{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
