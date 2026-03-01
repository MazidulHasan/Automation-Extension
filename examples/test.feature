Feature: Recorded Test Case
  As a user
  I want to execute the recorded test scenario
  So that I can verify the application functionality

Scenario: Recorded User Journey
  Given I navigate to "https://www.saucedemo.com/"
  When I enter "standard_user" in the field
  When I enter "secret_sauce" in the field
  When I click "Login"
  When I click "Sauce Labs Bolt T-Shirt"
  When I click "Add to cart"
  When I click shopping cart link
  When I click "Checkout"
