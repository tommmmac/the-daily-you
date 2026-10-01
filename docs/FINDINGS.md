# Findings

What I've learned building The Daily You. Newest first.

## 2026-10-02

- **The model treated "new" as "instead of".** I said I'd started at a bar, and the Archivist replaced "works at a cafe" with "works at a bar", though I never said I'd quit. It also added "Priya got a job at Atlassian" as a second line instead of updating Priya's. Fix: the prompt says a new fact doesn't cancel an old one unless I say so, and one line per person, with a worked example of both. Next run got both right.
- **Don't let the model do date maths.** "My exam is next Tuesday", said on Friday the 2nd, should mean ask on Wednesday the 7th. Asked for the day to follow up, it said the 13th. Asked just for the exam day with a plain list of dates, it said the 13th again. Fix: the model only picks the day off a calendar labelled the way people talk ("this coming Tuesday", "the Tuesday after that"), and code adds a day and writes the date into the text ("COMP3000 exam (Tue 6 Oct)"). After that, opening the app on Wednesday got "How'd the COMP3000 exam go this week?", and printing my answer closed the thread.
- **Recall: the hard part is knowing when to say nothing.** I built an eval (`bun run eval:recall`): 300 fake days, 12 special ones, and 16 things I might say while journaling, 4 of which shouldn't bring anything up. First version: right day 10/12, but it stayed quiet 0/4. For "studied in the library" it brought up a random library day. Each fix, measured:
  - Have the model write *what connects* before the page number (JSON fields are generated in order), and list "0 = nothing" as a real option: quiet 2/4.
  - Pick the 20 candidates with MMR so they aren't 15 copies of the same gym day: the special day made the top 20 in 11/12 instead of 10/12.
  - Label each page "routine" or "one-off" by counting near-identical days (similarity over 0.85). In the fake diary every special day had 0 and every routine day had 5+: quiet 4/4.
  - Say what makes a page worth it: something *happened* that day (got hurt, got news, a fight), not just doing the same activity: right day 11/12, wrong day 0/12, quiet 4/4.
  - With 16 cases one answer moves a score by 6%, and some changes swapped which cases passed without changing the total. A bigger eval would help before tuning further.
- **Small diaries break the routine label.** With 6 real-looking entries nothing has look-alikes, so everything is "one-off" and the picker grabbed a plain bouldering day over the ankle injury. The "something happened" rule fixed that too.
- **Qwen sometimes switches to Chinese.** About 1 in 6 replies to "yeah keen, john is coming too" came back in Chinese ("you俩..."), with or without recall, so it wasn't recall's fault. One line in the Reporter prompt ("always reply in the language the diarist writes in") took it to 0/12.
- **And again, don't let the model do date maths.** "It's been a little over a week since you rolled it" for something 19 days ago. Now code says "about 3 weeks ago" next to the recalled page.

## 2026-10-01

- **A casual reply got routed as an edit.** I let the router send "change the headline" style messages to the Copy Desk. Mid-chat, the Reporter asked what parts of a movie were funny, I said "yeah the driving bit", and the router sent it to the Copy Desk, which rewrote page 1 of the day's entry. The router only saw that one message, not the question it was answering. Fix: edits only happen from the Edit button, and chat always goes to the Reporter. Some actions are safer behind a button than behind a guess.
- **Agents cover for each other.** After the bad edit I typed "wat", and the Reporter, seeing the Copy Desk's "Done" in the shared history, made up an excuse ("sorry, that was a joke!"). A shared transcript means one agent's mistake becomes the next agent's context. The root cause is that every assistant message goes to the model as its own words. 
- **Embeddings need context, and keyword search can make them worse.** Before building The Morgue I tested recall on 300 fake diary days with 12 hidden "needle" days and 24 questions, using `nomic-embed-text`. Embedding just the text got the right day first 14/24 times. Putting the date and headline in front of each chunk got 19/24 ("did John want to go climbing" went from #166 to #1, because only the headline said John). Mixing in SQLite keyword search (RRF) dropped it to 15/24: normal days share words with special ones ("coffee with Priya, she's applying for jobs"), so keyword search confidently found the wrong days and dragged the right ones down. Letting `qwen2.5:14b` pick from the top 20 got 23/24, at about 2s a go. Dates ("what did I do on 14 March") never worked with vectors and need a plain date filter. Fake data I wrote myself, so treat the numbers loosely.
- **A facts file makes the Reporter ask better questions.** Same message, "went to work today, pretty tiring". With an empty facts file: "What kind of work were you doing today?" With one saying I work at a bar and a cafe: "Which place did you work at tonight? The bar or the cafe?"

## 2026-09-30

- **Slang snowballs.** "Was sick" (meaning great) was read as being ill, and every later step built on it: the entry was printed as "Local Developer Battles Through Illness". Fix: tell the prompts about slang, and have the Reporter ask when something's unclear.
- **The interviewer's guesses become facts.** The Copy Desk treated the Reporter's questions as things I'd said. Fix: label who said what, and only trust the diarist's words.
- **Structure beats freedom.** Having the model fill a JSON schema and letting code do the layout gives a well-formed entry every time. Example headlines in the prompt fixed flat or ALL CAPS headlines.
- **Speed is about loading.** About 77s for the first print while the model loads, 9–13s after. Keeping one model loaded for every role fixes most of it.

## Open questions

- Can the Reporter follow up on past days without inventing history?
- Is a model call worth it for routing, compared with keyword matching?
- How do smaller and cloud models compare for each agent?
