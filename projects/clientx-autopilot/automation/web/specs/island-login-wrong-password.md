---
id: island-login-wrong-password
title: 密码错误时不能登录
service: yundeng-island
journey: account
tags: @gated @P1 @account
---

# 密码错误时不能登录

## Given
- 用户「bingo_fan」已经注册并退出登录

## When
- 玩家用错误的密码登录

## Then
- 面板提示「用户名或密码不对」，仍然是未登录状态
