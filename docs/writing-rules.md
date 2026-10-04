# Writing rules

The kit builds a prompt with generic rules that suit most small businesses. They keep replies short, stop the assistant from guessing prices, and stop it from promising a time slot. Your own rules go in `extraRules` in `src/chat.config.ts`. This page explains how to write them.

Each rule is added to the prompt as one bullet, in the block that begins "Stay truthful to the information below".

## An example

These are the four rules in the demo. The business is a fictional dental practice.

```ts
extraRules: [
  "Never diagnose, never suggest treatment or medication, and never say whether something is serious. Suggest booking an examination.",
  "For swelling that affects breathing or swallowing, bleeding that will not stop, or an injury to the face or jaw: tell the visitor to call emergency services now, then the practice's emergency line.",
  "Never confirm what an insurer or plan will cover. Give the published statement on payment and tell them to call.",
  "Do not ask about medical history in chat.",
],
```

Each one covers a single behaviour. Each one also says what to do instead of the forbidden thing.

## How to write a good rule

**One behaviour per rule.** A rule that says three things is hard for the model to follow and hard for you to test. Split it. If the model gets one part wrong, you know which line to fix.

**Say what to do instead.** "Never confirm insurance cover" leaves the assistant with nothing to say. "Never confirm what an insurer or plan will cover. Give the published statement on payment and tell them to call" gives it an answer. A bare ban tends to produce a vague or evasive reply.

**Be specific.** Name the situation and the action. "For swelling that affects breathing or swallowing" is better than "for urgent problems".

**Cover the emergency case.** Think about what a visitor could type in a panic. For a dental practice, that is swelling, bleeding and injury. For a plumber, it is a burst pipe or a gas smell. For a vet, it is a poisoned or injured animal. Write one rule that tells the assistant to send the visitor to emergency services or your emergency line, in plain words. Do not leave it to chance.

**Keep rules short.** Every rule is sent with every request. Short rules also leave the model less room to misread them.

**Write plain text.** Do not use markdown, and do not use dashes as punctuation. The assistant copies the style it is given.

## Do not put unpublished facts in the content file

The content file is the complete picture of what the assistant knows. If a price, a policy or a promise is in it, the assistant may repeat it to a visitor as fact.

- Only list a price if you will honour it. The assistant may repeat only published prices.
- If a price depends on a visit, say so in the service's price field and in `pricingNote`. Do not guess a range to be helpful.
- Do not put in staff holiday plans, draft policies, or prices you plan to change.
- Do not put secrets in it. Treat everything in it as public.

## Tighten the rule before you change the model

When a reply is wrong, the cause is usually a vague rule or a missing fact. Fix that first.

1. Read the failing reply and decide which rule should have prevented it.
2. Make that rule more specific, or add the missing fact to the content file.
3. Run the check again.
4. Only if a clear rule is still ignored, try a different model with `CHAT_MODEL`.

A different model changes the cost of each reply. It may also change how closely the rules are followed. It is not a fix for a rule that is unclear.

## Run the check after every edit

```bash
npm run check:rules
```

The check needs `ANTHROPIC_API_KEY`. It sends twelve test questions to the real model, using the prompt built from your content and config, and checks the replies. It prints a table of passes and failures. Without a key it prints a message and does nothing.

The cases are in `scripts/rules-cases.ts`. They are written for the demo practice, so they check things like the Saturday opening hours and the `$65` examination price. When you change the content file for your own business, change the cases to match. Add a case for each rule you write: a question that should trigger the rule, and a check on the reply that fails if the rule is ignored.

The check looks at strings only, so a failure should be read, not trusted blindly. A reply that says a time "cannot be confirmed" is not a confirmation, and `$65.00` is the same price as `$65`. The checks skip a booking word that is negated earlier in its sentence and treat a whole amount with zero cents as the same figure, but they will still get some replies wrong in both directions. Open the reply, then decide.

The table also has a raw dash column. It shows whether the model wrote a dash character before the filter removed it. It is reported only and never counts as a failure, so you can see whether the model follows the rule or the filter is doing the work.

The check cannot tell whether a reply is kind or well put. Read a few replies yourself before you go live, and keep testing after the content changes.
