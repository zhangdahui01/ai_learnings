---
id: hall-sit
title: A monk sits, the time counts, and standing up keeps it
service: quiet-hall
journey: sit
tags: @gated @P0 @progression
---

# A monk sits, the time counts, and standing up keeps it

## Given
- a monk who has entered the hall

## When
- the monk sits down

## Then
- the state says "静坐中" and the sitting count goes up by 1
- the timer moves past "00:00"

## When
- the monk stands up

## Then
- the state says "未入坐" and the timer shows "00:00"
- the accumulated time is more than "00:00"

## Cleanup
- the monk leaves the temple
