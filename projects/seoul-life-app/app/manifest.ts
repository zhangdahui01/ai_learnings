import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "首尔生活助手",
    short_name: "首尔助手",
    description: "拍一下就看懂韩国的货架、菜单和路牌，顺便学韩语",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#1f6f5c",
    lang: "zh-CN",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
