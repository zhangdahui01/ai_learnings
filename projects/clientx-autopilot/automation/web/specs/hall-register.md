---
id: hall-register
title: A visitor registers an ID and finds their merit and its record on return
service: quiet-hall
journey: register
tags: @gated @P0 @progression
---

# A visitor registers an ID and finds their merit and its record on return

## Given
- the temple gate is open

## When
- the visitor registers a new ID

## Then
- a return code is shown once
- the hall shows the visitor as registered with merit 0

## When
- the monk knocks the wooden fish 2 times, prostrates once and leaves the temple

## When
- the visitor comes back with the same ID on the same device

## Then
- merit shows 5
- the merit record lists "礼拜 ×1" as +3 and "敲木鱼 ×2" as +2, newest first, each with its time

## When
- someone on another device tries the same ID with a wrong return code

## Then
- the gate says "回寺口令不对"

## Cleanup
- the monk leaves the temple
