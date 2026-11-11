@gated @P0
Feature: Login
  Service: sample-checkout   Journey: login

  Scenario: Member logs in
    Given the login screen is open
    When the member logs in with a valid member ID and password
    Then the product list is shown
