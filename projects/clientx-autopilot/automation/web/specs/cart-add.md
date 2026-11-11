---
id: cart-add
title: Member adds a product to the cart
service: sample-checkout
journey: cart
tags: @gated @P0
---

# Member adds a product to the cart

## Given
- a logged-in member on the product list

## When
- the member adds "Kettle" to the cart

## Then
- the cart badge shows 1
- the cart lists "Kettle" with quantity 1

## Cleanup
- empty the cart
