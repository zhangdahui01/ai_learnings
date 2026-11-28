"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { speakKorean } from "@/lib/speak";
import { SCENES } from "@/lib/scenes";

type Word = {
  id: string;
  word_ko: string;
  romanization: string;
  meaning_zh: string;
  meaning_en: string;
  hanja: string | null;
  mnemonic: string | null;
  scene: string | null;
};

export default function Vocab() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase
      .from("vocab")
      .select("id, word_ko, romanization, meaning_zh, meaning_en, hanja, mnemonic, scene")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) setError(true);
        else setWords(data as Word[]);
      });
  }, []);

  const sceneLabel = (id: string | null) => SCENES.find((s) => s.id === id)?.label;

  return (
    <div>
      <h1>生词本</h1>
      <p className="sub">扫描时遇到的词会自动存在这里</p>
      {error && <div className="msg">生词本加载失败，请稍后再试</div>}
      {words && words.length === 0 && <div data-testid="vocab-empty" className="card">还没有生词。去扫一次货架或菜单，词就会出现在这里。</div>}
      {words?.map((w) => (
        <div key={w.id} data-testid="word" className="card">
          <div className="row">
            <div style={{ flex: 1 }}>
              <span className="ko">{w.word_ko}</span>
              {w.hanja && <span className="meta"> {w.hanja}</span>}
              <div className="meta">{w.romanization}</div>
            </div>
            <button className="btn ghost small" onClick={() => speakKorean(w.word_ko)}>
              听发音
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            {w.meaning_zh}
            <span className="meta"> · {w.meaning_en}</span>
          </div>
          {w.mnemonic && <div style={{ marginTop: 6 }}>记法：{w.mnemonic}</div>}
          {sceneLabel(w.scene) && <div className="meta" style={{ marginTop: 6 }}>来自：{sceneLabel(w.scene)}</div>}
        </div>
      ))}
    </div>
  );
}
