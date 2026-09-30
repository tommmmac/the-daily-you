import { z } from "zod";

/** What the Copy Desk returns when going to print. Rendered by newsroom/print.ts. */
export const Story = z.object({
  headline: z.string().min(1),
  subhead: z.string(),
  lede: z.string().min(1),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  pull_quote: z.string(),
  mood: z.number().int().min(1).max(10),
  tags: z.array(z.string()),
  people: z.array(z.string()),
});
export type Story = z.infer<typeof Story>;
