"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  data?: any;
}
interface HealthResp {
  ok: boolean;
  pending_review: number;
  checks: Check[];
  error?: string;
}

export default function HealthPage() {
  const [h, setH] = useState<HealthResp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const d = await fetch("/api/health").then((r) => r.json());
    setH(d);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Health / Seed Check</h1>
          <p className="text-muted-foreground text-sm">
            Proves the pipeline produced sane, exportable data.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {h && (
            <Badge variant={h.ok ? "success" : "warning"}>
              {h.ok ? "ALL CHECKS PASS" : "NEEDS ATTENTION"}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={load}>
            Re-run
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground">Running checks…</p>}
      {h?.error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            {h.error}
          </CardContent>
        </Card>
      )}

      {h?.checks.map((c) => (
        <Card key={c.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span>{c.pass ? "✅" : "⚠️"}</span>
              {c.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>{c.detail}</div>
            {c.id === "scores" && c.data && (
              <div className="grid gap-3 md:grid-cols-2">
                <ScoreList title="Top 5" rows={c.data.top5} />
                <ScoreList title="Bottom 5" rows={c.data.bottom5} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ScoreList({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div>
      <div className="font-medium text-foreground mb-1">{title}</div>
      <ul className="space-y-1">
        {(rows || []).map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-semibold w-8">{r.relevance_score}</span>
            <span className="truncate">{r.podcast?.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
