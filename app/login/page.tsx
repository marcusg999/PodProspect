"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setErr(null);
    try {
      const sb = getBrowserClient();
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="max-w-md mx-auto pt-16">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to PodProspect</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <p className="text-sm">
              Magic link sent to <strong>{email}</strong>. Check your inbox.
            </p>
          ) : (
            <>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button className="w-full" onClick={send} disabled={!email}>
                Send magic link
              </Button>
              {err && <p className="text-sm text-destructive">{err}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
