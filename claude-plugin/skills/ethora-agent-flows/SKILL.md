---
description: Write or edit a scripted conversation flow for an Ethora AI agent, as flowsYaml. Use when the user wants an agent to follow a fixed sequence such as an opening menu, an appointment request, an intake questionnaire, a survey or a lead-capture form, rather than letting the model improvise every turn.
---

# Authoring Ethora agent flows

A flow is a deterministic script an agent follows. Set it with the `flowsYaml` field on
`ethora-agents-create-v2` or `ethora-agents-update-v2`.

**The server compiles and validates the YAML on save.** An invalid script is rejected with code
`FLOWS_INVALID` and per-problem details, and nothing is stored, so a bad draft cannot break a live
agent. Read `details` rather than guessing at the next attempt.

**Call `fetch` with id `doc:agent-flows` for the authoritative reference** before writing anything
non-trivial. It is maintained next to the compiler, so it does not drift. What follows is the
shortest thing that works.

```yaml
version: 1
flows:
  start:                          # reserved: runs when a conversation opens
    steps:
      - say: "Hi! How can I help?"
        buttons:
          - { label: "Book an appointment", goto: appointment }
          - { label: "Something else", end: true }
  appointment:
    description: "Collect an appointment request"
    trigger: { phrases: ["appointment", "book a visit"] }
    steps:
      - ask: "Which location suits you?"
        id: location
        options: [Downtown, Westside]
      - ask: "Best phone number to reach you?"
        id: phone
        type: phone
        retry: "That doesn't look like a phone number, could you check it?"
      - say: "Thanks, we'll call {phone} to confirm a slot at {location}."
      - end: true
```

## The rules that catch people out

- **`start` is reserved.** Include it and it fires when a conversation opens, which is how you get
  an opening menu. Without it, a flow is entered by `trigger.phrases` or from a button.
- **Buttons are authored here**, as `buttons:` on a `say` step or `options:` on an `ask` step. There
  is no separate tool for them. Tapping one posts its value as an ordinary message.
- **`ask` stores into a slot** named by its `id`. Refer to it later as `{id}` in any text. `type`
  validates the answer and `retry` is what the agent says when validation fails.
- **`when: "slot == value"`** on any step skips it when the condition is false.
- Keep `say` text short. It renders as chat bubbles, not a page.

## Good practice

Start with `start` plus one task flow and get it saving before adding more. Give every `ask` an `id`
you will actually reference. Pass an empty string to `flowsYaml` to clear a script.

The agent still handles anything outside a flow with the model, so a flow does not have to cover
every case, only the parts that need to be reliable.
