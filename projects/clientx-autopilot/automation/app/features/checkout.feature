@gated @P0 @payment
Feature: Checkout
  Service: sample-checkout   Journey: pay

  Scenario: Member pays for the cart with a saved card
    Given a logged-in member with "Kettle" in the cart
    When the member checks out and pays with "Saved card"
    Then the confirmation says "Payment complete" with an order number
    And the cart badge shows 0

  Scenario: Paying without a payment method is refused
    Given a logged-in member with "Kettle" in the cart
    When the member checks out and pays without choosing a method
    Then the payment screen says "Choose a payment method"
    And the cart badge shows 1
