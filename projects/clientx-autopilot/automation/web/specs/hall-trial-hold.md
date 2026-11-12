---
id: hall-trial-hold
title: A seated monk calls a trial and holds composure through it
service: quiet-hall
journey: trial
tags: @gated @P1 @progression
---

# A seated monk calls a trial and holds composure through it

## Given
- a monk seated in the hall with merit 0

## When
- the monk calls a stray dog

## Then
- the hall announces "野狗闯进大殿，绕着你狂吠" and shows the composure meter
- the monk cannot stand up while the trial lasts

## When
- composure has dropped and the monk knocks the wooden fish and prostrates

## Then
- composure is higher than before

## When
- the monk keeps gathering the mind until the dog leaves

## Then
- the trials held count shows 1
- merit shows 14: 1 for the knock, 3 for the prostration, 10 for holding
- the monk is still seated in the hall

## Cleanup
- the monk leaves the temple
