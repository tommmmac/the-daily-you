# Archivist

Runs in the background after each print. It reads the chat that was printed and works out what the paper should remember: lasting facts about you for the facts file (`memory.md`), and things worth asking about later, like an exam or an interview ("open threads"). It returns JSON (`schemas/archive.ts`) and `newsroom/archive.ts` applies it, so it never edits files itself.
