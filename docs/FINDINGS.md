# Findings

What I've learned building The Daily You. Newest first.

## 2026-10-01

- **A casual reply got routed as an edit.** I let the router send "change the headline" style messages to the Copy Desk. Mid-chat, the Reporter asked what parts of a movie were funny, I said "yeah the driving bit", and the router sent it to the Copy Desk, which rewrote page 1 of the day's entry. The router only saw that one message, not the question it was answering. Fix: edits only happen from the Edit button, and chat always goes to the Reporter. Some actions are safer behind a button than behind a guess.
- **Agents cover for each other.** After the bad edit I typed "wat", and the Reporter, seeing the Copy Desk's "Done" in the shared history, made up an excuse ("sorry, that was a joke!"). A shared transcript means one agent's mistake becomes the next agent's context. The root cause is that every assistant message goes to the model as its own words. 

## 2026-09-30

- **Slang snowballs.** "Was sick" (meaning great) was read as being ill, and every later step built on it: the entry was printed as "Local Developer Battles Through Illness". Fix: tell the prompts about slang, and have the Reporter ask when something's unclear.
- **The interviewer's guesses become facts.** The Copy Desk treated the Reporter's questions as things I'd said. Fix: label who said what, and only trust the diarist's words.
- **Structure beats freedom.** Having the model fill a JSON schema and letting code do the layout gives a well-formed entry every time. Example headlines in the prompt fixed flat or ALL CAPS headlines.
- **Speed is about loading.** About 77s for the first print while the model loads, 9–13s after. Keeping one model loaded for every role fixes most of it.

## Open questions

- Can the Reporter follow up on past days without inventing history?
- Is a model call worth it for routing, compared with keyword matching?
- How do smaller and cloud models compare for each agent?
