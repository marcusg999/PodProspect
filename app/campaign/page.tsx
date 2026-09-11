"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Campaign } from "@/lib/types";

export default function CampaignPage() {
  const [c, setC] = useState<Campaign | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/campaign")
      .then((r) => r.json())
      .then((d) => setC(d.campaign))
      .catch(() => {});
  }, []);

  if (!c) return <p className="text-muted-foreground">Loading campaign…</p>;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/campaign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: c.name,
        pitch_focus: c.pitch_focus,
        guest_bio: c.guest_bio,
        talking_points: c.talking_points,
        target_keywords: c.target_keywords,
      }),
    });
    const d = await res.json();
    if (d.campaign) setC(d.campaign);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Campaign</h1>
        <p className="text-muted-foreground text-sm">
          Single-campaign mode. Edit the guest bio, talking points, and target keywords.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          </Field>
          <Field label="Pitch focus">
            <Textarea
              rows={4}
              value={c.pitch_focus ?? ""}
              onChange={(e) => setC({ ...c, pitch_focus: e.target.value })}
            />
          </Field>
          <Field label="Guest bio">
            <Textarea
              rows={4}
              value={c.guest_bio ?? ""}
              onChange={(e) => setC({ ...c, guest_bio: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Talking points</CardTitle>
          <p className="text-xs text-muted-foreground">One per line.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={6}
            value={c.talking_points.join("\n")}
            onChange={(e) =>
              setC({ ...c, talking_points: e.target.value.split("\n").filter(Boolean) })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target keywords</CardTitle>
          <p className="text-xs text-muted-foreground">
            Comma-separated. These drive Podcast Index + iTunes search.
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={c.target_keywords.join(", ")}
            onChange={(e) =>
              setC({
                ...c,
                target_keywords: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save campaign"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
