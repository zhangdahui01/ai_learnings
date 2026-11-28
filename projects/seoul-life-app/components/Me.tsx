"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function Me({ session }: { session: Session }) {
  const [prefs, setPrefs] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<"" | "ok" | "fail">("");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("preferences")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPrefs(data?.preferences || "");
        setLoaded(true);
      });
  }, [session.user.id]);

  async function save() {
    setSaved("");
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: session.user.id, preferences: prefs.slice(0, 1000), updated_at: new Date().toISOString() });
    setSaved(error ? "fail" : "ok");
  }

  return (
    <div>
      <h1>我的</h1>
      <p data-testid="whoami" className="sub">{session.user.email}</p>

      <h2>我的偏好</h2>
      <p className="sub">每次推荐都会参考这里，例如肤质、口味、忌口、预算</p>
      <textarea
        data-testid="prefs"
        className="field"
        placeholder="例如：敏感肌；不吃辣；不吃生食；买东西优先看性价比"
        value={prefs}
        disabled={!loaded}
        onChange={(e) => setPrefs(e.target.value)}
      />
      <button data-testid="save-prefs" className="btn" disabled={!loaded} onClick={save}>
        保存偏好
      </button>
      {saved === "ok" && <div data-testid="prefs-saved" className="msg ok">已保存</div>}
      {saved === "fail" && <div className="msg">保存失败，请稍后再试</div>}

      <h2>账号</h2>
      <button data-testid="logout" className="btn ghost" onClick={() => supabase.auth.signOut()}>
        退出登录
      </button>
    </div>
  );
}
