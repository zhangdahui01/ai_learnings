---
id: hall-id-taken
title: An ID that is in use cannot be taken by someone else
service: quiet-hall
journey: enter
tags: @gated @P1 @regression
---

# An ID that is in use cannot be taken by someone else

## Given
- a monk who has entered the hall with an ID

## When
- a second visitor tries to enter with the same ID

## Then
- the gate says "这个 ID 已有人在用，请换一个"
- the second visitor stays at the gate

## Cleanup
- the first monk leaves the temple
