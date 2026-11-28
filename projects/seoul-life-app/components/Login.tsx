"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg({
          ok: false,
          text: error.message.includes("not confirmed")
            ? "邮箱还没有确认，请先点开确认邮件里的链接"
            : "邮箱或密码不正确",
        });
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setMsg({ ok: false, text: `注册失败：${error.message}` });
      else if (!data.session) {
        setMsg({ ok: true, text: "确认邮件已发出。点开邮件里的链接后，回到这里登录" });
        setMode("in");
      }
    }
    setBusy(false);
  }

  return (
    <div>
      <h1>首尔生活助手</h1>
      <p className="sub">拍一下就看懂货架、菜单和路牌，顺便学韩语</p>
      <form onSubmit={submit}>
        <input
          className="field"
          type="email"
          data-testid="email"
          placeholder="邮箱"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="field"
          type="password"
          data-testid="password"
          placeholder="密码（至少 6 位）"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {msg && <div data-testid="login-msg" className={`msg ${msg.ok ? "ok" : ""}`}>{msg.text}</div>}
        <button data-testid="submit" className="btn" disabled={busy}>
          {busy ? "请稍候" : mode === "in" ? "登录" : "注册"}
        </button>
      </form>
      <p className="sub" style={{ marginTop: 16, textAlign: "center" }}>
        {mode === "in" ? "还没有账号？" : "已有账号？"}
        <button
          data-testid="switch-mode"
          style={{ background: "none", border: 0, color: "var(--brand)", padding: 8 }}
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setMsg(null);
          }}
        >
          {mode === "in" ? "注册" : "登录"}
        </button>
      </p>
    </div>
  );
}
