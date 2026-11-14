@P0 @progression
Feature: Quiet Hall
  Service: quiet-hall   Journeys: enter, register, sit, bow

  Scenario: A visitor enters the temple and becomes a monk
    Given the temple gate is open
    When the visitor enters the temple
    Then the hall shows the visitor's monk with a dharma name
    And the monk is not sitting yet and the timer shows "00:00"
    And the hall counts at least 1 monk present

  Scenario: A monk sits, the time counts, and standing up keeps it
    Given a monk who has entered the hall
    When the monk sits down
    Then the state says "静坐中"
    And the timer moves past "00:00"
    When the monk stands up
    Then the state says "未入坐"
    And the accumulated time is more than "00:00"

  Scenario: A monk greets the hall with palms together
    Given a monk who has entered the hall
    When the monk bows to the hall
    Then the hall confirms "向大众合十"

  Scenario: A monk knocks the wooden fish and gains merit
    Given a monk who has entered the hall
    When the monk knocks the wooden fish 3 times
    Then the merit shows 3

  Scenario: A monk prostrates and turns prayer beads
    Given a monk who has entered the hall
    When the monk prostrates 2 times
    And the monk turns 4 prayer beads
    Then the prostration count shows 2
    And the bead count shows 4

  Scenario: A visitor registers an ID and finds the merit record on return
    Given the temple gate is open
    When the visitor registers a new ID
    Then a return code is shown once
    And the hall shows the monk as registered
    When the monk prostrates 1 times
    And the monk leaves and comes back with the same ID
    Then the merit shows 3
    And the newest line of the merit record is "礼拜 ×1" with "+3"
