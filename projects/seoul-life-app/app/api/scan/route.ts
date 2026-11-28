import { NextResponse } from "next/server";
import { supabaseForToken } from "@/lib/supabase";
import { SCENE_PROMPTS, type Scene } from "@/lib/scenes";
import { unitPriceText } from "@/lib/unitPrice";

export const maxDuration = 60;

const DAILY_SCAN_LIMIT = 50;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

const TOOL = {
  name: "report_scan",
  description: "Report everything recognized in the photo.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "一两句中文总结，直接回答用户的需求" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name_ko: { type: "string", description: "照片上的韩文原文" },
            name_zh: { type: "string", description: "中文名称" },
            name_en: { type: "string", description: "English name" },
            purpose: { type: "string", description: "一句中文说明它是什么、做什么用" },
            price_krw: { type: ["number", "null"], description: "价签上的价格（韩元），看不清则为 null" },
            size_amount: { type: ["number", "null"], description: "规格数值，例如 500" },
            size_unit: { type: ["string", "null"], description: "规格单位：g、kg、ml、l、个、片 等" },
            promo: { type: ["string", "null"], description: "促销，例如 1+1、2+1" },
            recommended: { type: "boolean", description: "是否推荐给用户" },
            reason: { type: ["string", "null"], description: "推荐理由，中文一句话" },
          },
          required: ["name_ko", "name_zh", "name_en", "purpose", "recommended"],
        },
      },
      vocab: {
        type: "array",
        description: "照片里值得初学者记住的 3 到 8 个韩语生活词汇",
        items: {
          type: "object",
          properties: {
            word_ko: { type: "string" },
            romanization: { type: "string" },
            meaning_zh: { type: "string" },
            meaning_en: { type: "string" },
            hanja: { type: ["string", "null"], description: "如果是汉字词，给出对应汉字，否则为 null" },
            mnemonic: { type: ["string", "null"], description: "给中文母语者的一句联想记忆法" },
          },
          required: ["word_ko", "romanization", "meaning_zh", "meaning_en"],
        },
      },
    },
    required: ["summary", "items", "vocab"],
  },
};

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "请先登录");
  const db = supabaseForToken(token);
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return fail(401, "登录已过期，请重新登录");
  const user = userData.user;

  let body: { scene?: Scene; need?: string; image?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, "请求格式不正确");
  }
  const scene = body.scene as Scene;
  const need = (body.need || "").slice(0, 300);
  const image = body.image || "";
  if (!SCENE_PROMPTS[scene]) return fail(400, "未知的场景");
  if (!image || image.length > 6_000_000) return fail(400, "照片缺失或过大");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail(503, "AI 密钥尚未配置，暂时无法识别照片");

  const { data: allowed, error: usageError } = await db.rpc("bump_usage", {
    p_kind: "scan",
    p_limit: DAILY_SCAN_LIMIT,
  });
  if (usageError) return fail(500, "用量检查失败");
  if (!allowed) return fail(429, `今天的扫描次数已用完（每天 ${DAILY_SCAN_LIMIT} 次）`);

  const { data: profile } = await db.from("profiles").select("preferences").eq("id", user.id).maybeSingle();

  const instructions = [
    SCENE_PROMPTS[scene],
    "用户是住在首尔的中文母语者，韩语初学。所有说明用简体中文，同时给出英文名。",
    need ? `用户这次的需求：${need}` : "用户这次没有写具体需求。",
    profile?.preferences ? `用户的长期偏好：${profile.preferences}` : "",
    "如果用户写了需求，把最合适的 1 到 2 个条目标为 recommended 并写明理由；没有写需求时可以不推荐。",
    "只报告照片里真实能看到的内容，看不清的价格和规格填 null，不要猜。不要自己计算单价。",
  ]
    .filter(Boolean)
    .join("\n");

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: instructions },
          ],
        },
      ],
    }),
  });
  if (!aiRes.ok) {
    console.error("anthropic error", aiRes.status, await aiRes.text());
    return fail(502, "识别服务出错，请稍后再试");
  }
  const ai = await aiRes.json();
  const toolUse = (ai.content || []).find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse) return fail(502, "没有识别出内容，请换个角度再拍一张");
  const result = toolUse.input as {
    summary: string;
    items: Record<string, unknown>[];
    vocab: Record<string, unknown>[];
  };

  const items = (result.items || []).map((it, i) => ({
    position: i + 1,
    name_ko: String(it.name_ko || ""),
    name_zh: String(it.name_zh || ""),
    name_en: String(it.name_en || ""),
    purpose: String(it.purpose || ""),
    price_krw: typeof it.price_krw === "number" ? it.price_krw : null,
    size_amount: typeof it.size_amount === "number" ? it.size_amount : null,
    size_unit: typeof it.size_unit === "string" ? it.size_unit : null,
    promo: typeof it.promo === "string" ? it.promo : null,
    recommended: Boolean(it.recommended),
    reason: typeof it.reason === "string" ? it.reason : null,
    unit_price_text: unitPriceText(it as never),
  }));

  // Saving is best effort: the user still gets the result if a write fails.
  let scanId: string | null = null;
  try {
    const { data: scan } = await db
      .from("scans")
      .insert({ scene, need, summary: result.summary || "", raw_result: result })
      .select("id")
      .single();
    scanId = scan?.id ?? null;
    if (scanId) {
      const path = `${user.id}/${scanId}.jpg`;
      const upload = await db.storage
        .from("scan-photos")
        .upload(path, Buffer.from(image, "base64"), { contentType: "image/jpeg" });
      if (!upload.error) await db.from("scans").update({ photo_path: path }).eq("id", scanId);
      if (items.length) await db.from("scan_items").insert(items.map((it) => ({ ...it, scan_id: scanId })));
      const vocab = (result.vocab || [])
        .filter((v) => v.word_ko)
        .map((v) => ({
          word_ko: String(v.word_ko),
          romanization: String(v.romanization || ""),
          meaning_zh: String(v.meaning_zh || ""),
          meaning_en: String(v.meaning_en || ""),
          hanja: typeof v.hanja === "string" ? v.hanja : null,
          mnemonic: typeof v.mnemonic === "string" ? v.mnemonic : null,
          scene,
          source_scan_id: scanId,
        }));
      if (vocab.length) {
        await db.from("vocab").upsert(vocab, { onConflict: "user_id,word_ko", ignoreDuplicates: true });
      }
    }
  } catch (e) {
    console.error("save failed", e);
  }

  return NextResponse.json({
    scanId,
    summary: result.summary || "",
    items,
    vocabCount: (result.vocab || []).length,
  });
}
