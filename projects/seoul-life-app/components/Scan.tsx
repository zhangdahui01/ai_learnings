"use client";

import { useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SCENES, type Scene } from "@/lib/scenes";
import { speakKorean } from "@/lib/speak";

type Item = {
  position: number;
  name_ko: string;
  name_zh: string;
  name_en: string;
  purpose: string;
  price_krw: number | null;
  size_amount: number | null;
  size_unit: string | null;
  promo: string | null;
  recommended: boolean;
  reason: string | null;
  unit_price_text: string | null;
};

type Result = { summary: string; items: Item[]; vocabCount: number };

const MAX_EDGE = 1568;

// Shrink the photo on the phone so uploads are small and fast.
async function compress(file: File): Promise<{ base64: string; url: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: url.split(",")[1], url };
}

export default function Scan({ session }: { session: Session }) {
  const [scene, setScene] = useState<Scene>("shelf");
  const [need, setNeed] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = SCENES.find((s) => s.id === scene)!;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { base64, url } = await compress(file);
      setPhoto(url);
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ scene, need, image: base64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "识别失败，请再试一次");
      else setResult(data);
    } catch {
      setError("照片处理或上传失败，请检查网络后再试");
    }
    setBusy(false);
  }

  const sorted = result ? [...result.items].sort((a, b) => Number(b.recommended) - Number(a.recommended)) : [];

  return (
    <div>
      <h1>扫一扫</h1>
      <p className="sub">选场景，写需求，拍一张</p>

      <div className="grid2">
        {SCENES.map((s) => (
          <button key={s.id} data-testid={`scene-${s.id}`} className={`chip ${scene === s.id ? "on" : ""}`} onClick={() => setScene(s.id)}>
            <b>{s.label}</b>
            <span>{s.hint}</span>
          </button>
        ))}
      </div>

      <input
        data-testid="need"
        className="field"
        placeholder={current.needPlaceholder}
        value={need}
        maxLength={300}
        onChange={(e) => setNeed(e.target.value)}
      />

      <input ref={fileRef} data-testid="photo-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <button data-testid="shoot" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "正在识别，大约 10 秒" : "拍照识别"}
      </button>

      {error && <div data-testid="scan-error" className="msg">{error}</div>}
      {photo && <img className="preview" src={photo} alt="刚拍的照片" />}

      {result && (
        <>
          {result.summary && <div data-testid="scan-summary" className="msg ok">{result.summary}</div>}
          {sorted.length === 0 && <div className="msg">没有识别出内容，请靠近一点再拍一张</div>}
          {sorted.map((it) => (
            <div key={it.position} data-testid="scan-item" className={`card ${it.recommended ? "rec" : ""}`}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span className="num">{it.position}</span>
                <div style={{ flex: 1 }}>
                  <div>
                    <b>{it.name_zh}</b>
                    {it.recommended && <span data-testid="rec-tag" className="tag">推荐</span>}
                  </div>
                  <div className="meta">{it.name_en}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="ko" style={{ flex: 1 }}>
                  {it.name_ko}
                </span>
                <button className="btn ghost small" onClick={() => speakKorean(it.name_ko)}>
                  听发音
                </button>
              </div>
              <div style={{ marginTop: 6 }}>{it.purpose}</div>
              {it.reason && <div style={{ marginTop: 6 }}>推荐理由：{it.reason}</div>}
              {(it.price_krw || it.unit_price_text || it.promo) && (
                <div data-testid="price-line" className="meta" style={{ marginTop: 6 }}>
                  {it.price_krw ? `${it.price_krw.toLocaleString("en-US")}韩元` : ""}
                  {it.size_amount && it.size_unit ? ` · ${it.size_amount}${it.size_unit}` : ""}
                  {it.promo ? ` · ${it.promo}` : ""}
                  {it.unit_price_text ? ` · ${it.unit_price_text}` : ""}
                </div>
              )}
            </div>
          ))}
          {result.vocabCount > 0 && <p data-testid="vocab-saved" className="sub">这次遇到的生词已存进生词本</p>}
        </>
      )}
    </div>
  );
}
