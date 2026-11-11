# Job: write the BDD spec

You are drafting specs for Case Factory. Two kinds of source arrive here:

- **Progression** (new feature): a feature spec, PRD, design or a short title. Cover the main path first, then the failure paths a user can actually hit. Tag `@progression`.
- **Regression** (existing behaviour): a manual case sheet, an existing scripted case, an incident, or a coverage gap. Keep the original intent and expected results; do not improve the product on paper. Tag `@regression`. For an incident, the scenario must fail on the pre-fix behaviour.

## Steps

1. Read `knowledge-base/<service>/strategic.json` (business rules, the journey, priority) and `operational.json` (preconditions, auth flows, selectors, code graph summary).
2. Decide the scenarios. One scenario = one spec. If the source mixes several, split them and say how.
3. Write each spec:
   - **Web** → `automation/web/specs/<id>.md`:
     ```markdown
     ---
     id: <kebab-case id, same as the file name>
     title: <actor does something>
     service: <service>
     journey: <journey id from the coverage map>
     tags: @progression|@regression @P0|@P1|@P2 [@payment] [@destructive]
     ---
     ## Given
     - <known state, one bullet per precondition>
     ## When
     - <one user action per bullet>
     ## Then
     - <one observable result per bullet>
     ## Cleanup
     - <how the state is restored, or "no side effect ...">
     ```
   - **App** → a `Scenario` in `automation/app/features/<journey>.feature` (Gherkin, same rules, tags on the Feature or Scenario).
4. Rules for the text:
   - Given = state, not UI steps. When = what the user does. Then = what a user or an external system can observe (text, status, order record), never an implementation detail.
   - Quote concrete values: `"Kettle"`, `1`, `"Payment complete"`. No "works correctly", no "as expected".
   - Steps that move money or change orders get `@payment` or `@destructive`.
5. Check every precondition key against `operational.json`. A precondition that is not there is an open question for a domain expert.
6. Validate: `python -c "from workflows.case_factory import validate_spec; import sys; print(validate_spec(open(sys.argv[1]).read()))" <spec>` must print `[]` (web specs).
7. Stop for QA review. Report the spec paths and the open questions. Do not write test code.
