export type Scene = "shelf" | "menu" | "cosmetics" | "subway";

export const SCENES: { id: Scene; label: string; hint: string; needPlaceholder: string }[] = [
  {
    id: "shelf",
    label: "超市货架",
    hint: "拍一排货架或几个商品",
    needPlaceholder: "想买什么？例如：不辣的拌饭酱",
  },
  {
    id: "menu",
    label: "餐厅菜单",
    hint: "拍菜单的一页",
    needPlaceholder: "口味或忌口？例如：不吃辣、不吃生食",
  },
  {
    id: "cosmetics",
    label: "药妆护肤",
    hint: "拍产品正面或成分表",
    needPlaceholder: "需求？例如：敏感肌用的洗面奶",
  },
  {
    id: "subway",
    label: "地铁路牌",
    hint: "拍站名、出口或指示牌",
    needPlaceholder: "要去哪里？例如：去蚕室站 2 号线",
  },
];

export const SCENE_PROMPTS: Record<Scene, string> = {
  shelf:
    "这是一张韩国超市货架或商品的照片。识别照片中每一个能看清的商品，读出价签上的价格、规格和促销（如 1+1、2+1）。",
  menu:
    "这是一张韩国餐厅菜单的照片。把每道菜作为一个条目，说明它是什么、主要食材、辣不辣、怎么吃，读出价格。",
  cosmetics:
    "这是一张韩国药妆或护肤品的照片。说明每个产品的类别、主要功效和主要成分，读出价格和规格。只做翻译和解释，不要给出用药、治疗或医美方面的建议。",
  subway:
    "这是一张韩国地铁或街道指示牌的照片。把每个站名、线路、出口或方向作为一个条目，说明它的意思和怎么走。价格字段留空。",
};
