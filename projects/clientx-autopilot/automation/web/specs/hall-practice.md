---
id: hall-practice
title: A monk prostrates and turns prayer beads, and the hall keeps the counts
service: quiet-hall
journey: practice
tags: @gated @P1 @progression
---

# A monk prostrates and turns prayer beads, and the hall keeps the counts

## Given
- a monk who has entered the hall with 0 prostrations and 0 beads

## When
- the monk prostrates 2 times

## Then
- the prostration count shows 2

## When
- the monk picks up the prayer beads and turns 4 beads

## Then
- the beads panel shows 4 of 108
- the bead count shows 4 after the panel is put away

## Then
- both counts are still there after the hall has been reloaded

## Cleanup
- the monk leaves the temple
