---
id: hall-trial-hold
title: A seated monk holds composure through a distraction
service: quiet-hall
journey: trial
tags: @gated @P1 @progression
---

# A seated monk holds composure through a distraction

## Given
- a monk seated in a hall where a stray dog is about to come in

## When
- the dog arrives

## Then
- the hall announces "野狗闯进大殿，绕着你狂吠" and shows the composure meter
- the monk cannot stand up while the trial lasts

## When
- the monk keeps gathering the mind until the dog leaves

## Then
- the composure count shows 1
- the monk is still seated in the hall

## Cleanup
- the monk leaves the temple
