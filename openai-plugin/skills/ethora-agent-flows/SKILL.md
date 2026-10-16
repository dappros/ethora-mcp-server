---
name: ethora-agent-flows
description: Write or edit a scripted conversation flow for an Ethora AI agent, as flowsYaml. Use when the user wants an agent to follow a fixed sequence such as an opening menu, a demo or callback request, a product survey or a lead-capture form, rather than letting the model improvise every turn.
---

# Authoring Ethora agent flows

A flow is a deterministic script an agent follows. Set it with the `flowsYaml` field on
`ethora-agent-create` or `ethora-agent-update`.

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
          - { label: "Request a demo", goto: demo }
          - { label: "Something else", end: true }
  demo:
    description: "Collect a product demo request"
    trigger: { phrases: ["demo", "see it in action"] }
    steps:
      - ask: "Which plan are you interested in?"
        id: plan
        options: [Starter, Business]
      - ask: "Which work email should we send the invite to?"
        id: email
        type: email
        retry: "That doesn't look like an email address, could you check it?"
      - say: "Thanks, the {plan} demo invite goes to {email}."
      - end: true
```

## The rules that catch people out

- **`start` is reserved.** Include it and it fires when a conversation opens, which is how you get
  an opening menu. Without it, a flow is entered by `trigger.phrases` or from a button.
- **Buttons are authored here**, as `buttons:` on a `say` step or `options:` on an `ask` step. There
  is no separate tool for them. Tapping one posts its value as an ordinary message.
- **`ask` stores into a slot** named by its `id`. Refer to it later as `{id}` in any text. `type`
  validates the answer (`text`, `number`, `date`, `phone`, `email`, `choice`) and `retry` is what the
  agent says when validation fails.
- **Ask only for what the task needs.** Flows collect contact and business details: a name, a work
  email, a plan, a preferred time. Never write a flow that asks for health or medical information,
  government identifiers, payment card numbers, biometric data or other sensitive personal data, and
  have the opening message say what the answers are used for.
- **`when: "slot == value"`** on any step skips it when the condition is false.
- Keep `say` text short. It renders as chat bubbles, not a page.

## Good practice

Start with `start` plus one task flow and get it saving before adding more. Give every `ask` an `id`
you will actually reference. Pass an empty string to `flowsYaml` to clear a script.

The agent still handles anything outside a flow with the model, so a flow does not have to cover
every case, only the parts that need to be reliable.
