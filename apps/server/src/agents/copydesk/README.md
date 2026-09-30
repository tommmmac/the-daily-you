# Copy Desk

Writes the pages of the paper: the front page from the first chat you print, a new page for each chat after that, and rewrites of a page when you ask for a change. It only returns a `story` as JSON (see `schemas/story.ts`); `newsroom/` lays that out as Markdown and saves it. Printing is the Go to print button. In chat, it only picks up requests to change an entry that's already printed that day.
