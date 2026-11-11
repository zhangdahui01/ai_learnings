---
id: login
title: Member logs in
service: sample-checkout
journey: login
tags: @gated @P0 @regression
---

# Member logs in

## Given
- the login page is open

## When
- the member logs in with a valid member ID and password

## Then
- the product list is shown

## Cleanup
- no side effect: logging in changes no data
