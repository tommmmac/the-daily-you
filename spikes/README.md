# Spikes

Quick throwaway experiments to test ideas before building them properly. Not part of the app.

## copydesk

Does a local model write a good news-style entry from a chat?

```bash
bun spikes/copydesk/chat.ts                            # chat with the Reporter, then type /print
bun spikes/copydesk/copydesk.ts                        # sample transcript, qwen2.5:14b
bun spikes/copydesk/copydesk.ts --model qwen2.5:7b     # compare models
bun spikes/copydesk/copydesk.ts my-day.json            # your own transcript
```

Output goes to `spikes/copydesk/out/` (gitignored). Tweak `SYSTEM` in `copydesk.ts` and rerun.
