---
id: seoul-login-wrong-password
title: 密码错误时不能登录
service: seoul-life-app
journey: account
tags: @gated @P1 @account
---

# 密码错误时不能登录

## Given
- 用户「dahui@example.test」已经注册

## When
- 用户用错误的密码登录

## Then
- 页面提示「邮箱或密码不正确」，仍然停在登录页
