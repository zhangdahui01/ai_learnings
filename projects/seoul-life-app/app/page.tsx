"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Login from "@/components/Login";
import Scan from "@/components/Scan";
import Vocab from "@/components/Vocab";
import Me from "@/components/Me";

type Tab = "scan" | "vocab" | "me";

// One page with tabs: iOS home-screen apps re-ask for camera access on page changes.
export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("scan");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <main className="app" />;
  if (!session)
    return (
      <main className="app">
        <Login />
      </main>
    );

  return (
    <main className="app">
      <div className={tab === "scan" ? "" : "hidden"}>
        <Scan session={session} />
      </div>
      {tab === "vocab" && <Vocab />}
      {tab === "me" && <Me session={session} />}
      <nav className="tabs">
        <div>
          <button data-testid="tab-scan" className={`tab ${tab === "scan" ? "on" : ""}`} onClick={() => setTab("scan")}>
            扫一扫
          </button>
          <button data-testid="tab-vocab" className={`tab ${tab === "vocab" ? "on" : ""}`} onClick={() => setTab("vocab")}>
            生词本
          </button>
          <button data-testid="tab-me" className={`tab ${tab === "me" ? "on" : ""}`} onClick={() => setTab("me")}>
            我的
          </button>
        </div>
      </nav>
    </main>
  );
}
