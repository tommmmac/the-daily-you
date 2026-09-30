# Findings

What I've learned building The Daily You. Newest first.

## 2026-09-30

- **Slang snowballs.** "Was sick" (meaning great) was read as being ill, and every later step built on it: the entry was printed as "Local Developer Battles Through Illness". Fix: tell the prompts about slang, and have the Reporter ask when something's unclear.
- **The interviewer's guesses become facts.** The Copy Desk treated the Reporter's questions as things I'd said. Fix: label who said what, and only trust the diarist's words.
- **Structure beats freedom.** Having the model fill a JSON schema and letting code do the layout gives a well-formed entry every time. Example headlines in the prompt fixed flat or ALL CAPS headlines.
- **Speed is about loading.** About 77s for the first print while the model loads, 9–13s after. Keeping one model loaded for every role fixes most of it.

## Open questions

- Can the Reporter follow up on past days without inventing history?
- Is a model call worth it for routing, compared with keyword matching?
- How do smaller and cloud models compare for each agent?
