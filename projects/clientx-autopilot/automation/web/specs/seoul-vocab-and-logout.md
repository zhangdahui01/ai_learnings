---
id: seoul-vocab-and-logout
title: 生词本显示存下的词，退出后回到登录页
service: seoul-life-app
journey: learn
tags: @gated @P1 @vocab @account
---

# 生词本显示存下的词，退出后回到登录页

## Given
- 用户已登录，生词本里有「우유」和「도서관」两个词

## When
- 用户打开生词本

## Then
- 两个词都显示韩文、罗马音和中文意思，汉字词「도서관」带汉字「圖書館」

## When
- 用户到「我的」保存偏好「不吃辣」，然后退出登录

## Then
- 偏好已保存到账号，页面回到登录表单
