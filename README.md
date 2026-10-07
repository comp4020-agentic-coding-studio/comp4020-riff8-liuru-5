# 六如 — a wall for passing things

This is a shared wall. Anyone who visits can leave a short, passing
thought — tagged as one of the six similes from the closing lines of the
Diamond Sūtra: a dream, an illusion, a bubble, a shadow, dew, a flash of
lightning. Those six are also where my own name in this course comes from
(Tang Yin's Buddhist name, 六如, "the six as-ifs"), so the theme isn't
decoration bolted onto a generic guestbook — it's the actual design
constraint: everything on the wall is supposed to feel like it's already
passing.

## What good means here

Good, for this app, is small and quiet rather than sticky. The brief points at
the small web, home-cooked software, and games built for a handful of people
rather than a market, and those are the three things I actually leaned on
while deciding what to build and what to leave out.

Robin Sloan's [*An App Can Be a Home-Cooked Meal*](https://www.robinsloan.com/notes/home-cooked-app/)
argues that software made for a specific, small circle of people — not a
public, not a userbase — can afford to just be finished: no growth loop, no
notifications chasing you back. The wall has no accounts, no follower count,
no read receipts. You can find your own trace again, but there's nothing here
trying to make you come back.

The [Small Technology Foundation](https://small-tech.org/)'s case for a small
web — public spaces people can actually understand the whole of, without
tracking or an algorithmic feed — is why the wall shows everything in one
plain reverse-chronological list, oldest at the bottom, nothing curated or
ranked. What you see is what's actually there.

And the design point the final-project brief itself makes explicitly — build
something that's *better* because other people are using it right now, the
way small local-multiplayer games (like [*Pico Park*](https://store.steampowered.com/app/1509960/PICO_PARK/))
only work because everyone is present at once — is what this slice doesn't
have yet. The wall updates on reload, not live; a second visitor's trace
doesn't appear until you refresh. That's deliberate for this week (this
crit's own brief says the real-time layer can wait), but it's the one thing
standing between this and actually delivering co-presence. Next crit's job.

## What's enforced vs. what's judged

Enforced, in `spec/`: a trace needs a real kind (one of the six) and non-empty
text of at most 240 whole characters after surrounding whitespace is removed.
Joined emoji and combined accents count as one character. Invalid submissions
return an explanation and keep the draft; text is never silently cut short.
The live counter is a convenience: validation also works without JavaScript.
Forms have a separate 64 KiB encoded-body limit and a 10-second read timeout;
oversized, stalled, or unsupported uploads receive 413, 408, or 415 respectively.
Malformed visitor cookies are replaced safely instead of interrupting the wall.
Traces persist in SQLite on the app's own volume, so they
survive a restart or a redeploy — not just the current process.

Judged, by me now and by a reader later: whether the wall actually feels like
the six similes it's named after, not a message board with a select box on
it, and whether the plain list stays legible once real people have used it.
I haven't built moderation, rate limiting, or a way to remove a trace — for a
wall this small, the honest position is that I haven't yet had a reason to
need any of them, not that I've reasoned my way out of needing them forever.

## What I deliberately didn't build yet

No real-time updates (crit 9), no visible distinction between visitors beyond
"yours vs. everyone else's" (no names, colours, or avatars — deferred until
there's an actual multi-user feature that needs it), no server-side logging
beyond what Fly captures by default (crit 11), and no moderation. All four are
real gaps, not oversights, and each has a crit on the course's own schedule
that's the right place to close it.
