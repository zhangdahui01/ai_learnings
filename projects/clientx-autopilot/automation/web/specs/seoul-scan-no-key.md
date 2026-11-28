---
id: seoul-scan-no-key
title: 识别服务没配好时给出明确提示
service: seoul-life-app
journey: scan
tags: @P1 @scan
---

# 识别服务没配好时给出明确提示

## Given
- 用户已登录，识别服务还没有配置 AI 密钥

## When
- 用户拍一张照片

## Then
- 页面提示「AI 密钥尚未配置，暂时无法识别照片」，不显示任何商品
- 拍照按钮恢复可用，可以再试一次
