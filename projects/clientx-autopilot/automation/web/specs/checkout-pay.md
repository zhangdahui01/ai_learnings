---
id: checkout-pay
title: Member pays for the cart with a saved card
service: sample-checkout
journey: pay
tags: @gated @P0 @payment
---

# Member pays for the cart with a saved card

## Given
- a logged-in member with "Kettle" in the cart

## When
- the member checks out and pays with "Saved card"

## Then
- the confirmation says "Payment complete" with an order number
- the cart badge shows 0

## Cleanup
- no side effect outside the test account: the order is created in the test tenant
