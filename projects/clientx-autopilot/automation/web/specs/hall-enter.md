---
id: hall-enter
title: A visitor enters the temple and becomes a monk
service: quiet-hall
journey: enter
tags: @gated @P0 @progression
---

# A visitor enters the temple and becomes a monk

## Given
- the temple gate is open

## When
- the visitor enters the temple

## Then
- the hall shows the visitor's monk with a dharma name
- the monk is not sitting yet and the timer shows "00:00"
- the hall counts at least 1 monk present

## Cleanup
- the visitor leaves the temple
