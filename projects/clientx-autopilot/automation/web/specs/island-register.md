---
id: island-register
title: 注册新用户后自动登录
service: yundeng-island
journey: account
tags: @gated @P0 @account
---

# 注册新用户后自动登录

## Given
- 游戏页面已打开，玩家打开「登录 / 注册」

## When
- 玩家用 1 位的用户名注册
- 玩家用 3 位的密码注册
- 玩家用用户名「bingo_fan」和 8 位密码注册

## Then
- 第一次提示用户名不合规，第二次提示密码至少 6 位
- 第三次注册成功，面板显示「已登录：bingo_fan」
- 开始页显示「已登录：bingo_fan」
