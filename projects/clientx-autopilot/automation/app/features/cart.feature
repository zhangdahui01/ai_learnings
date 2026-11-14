@gated @P0
Feature: Cart
  Service: sample-checkout   Journey: cart

  Scenario: Member adds a product to the cart
    Given a logged-in member on the product list
    When the member adds "Kettle" to the cart
    Then the cart badge shows 1
    And the cart lists "Kettle" with quantity 1
