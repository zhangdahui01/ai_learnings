---
id: island-guest-local-save
title: 不登录时进度存在本机，刷新后可以继续
service: yundeng-island
journey: save
tags: @gated @P0 @save
---

# 不登录时进度存在本机，刷新后可以继续

## Given
- 一位没登录的玩家已经摸过 Bingo，进度是 1/9

## When
- 玩家刷新页面
- 玩家点「继续旅程」

## Then
- 进度仍然是「心愿 1/9」，没有再出现开场白
