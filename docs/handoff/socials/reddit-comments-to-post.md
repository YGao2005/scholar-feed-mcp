# Reddit comments — ready to post

The copy-paste worksheet. Each entry: the thread link, then the exact comment
(plain text, no blockquote, so you can select and paste cleanly). Ordered for
posting — fresh/active threads first, evergreen ones after.

Rules (full version in `reddit-organic.md`): post from your aged personal
account, disclose every time (already baked in), don't post more than ~2 in a
day, reply fast to any follow-up without re-pitching. Bank a couple of no-link
helpful comments first.

---

## 1 · r/MLQuestions — post first
**Thread:** [How do you automatically track new AI research / compute articles into a Notion or spreadsheet?](https://www.reddit.com/r/MLQuestions/comments/1rpf0i6/)
**Why:** Recent, few answers, easy to be the top reply. Honest "partly the wrong tool" angle builds credibility.

- [ ] Posted

For the papers side of this there are pretty clean inputs. arxiv has a per-category RSS/Atom feed you can pipe straight into a sheet, and Semantic Scholar's API will give you summaries. The compute and infra news side is messier since that's mostly blogs and press releases, so for that you'd want RSS plus an LLM summarize step. A little cron calling the OpenAI or Anthropic API into Notion does the job, you don't really need Zapier.

One warning from doing this myself: most track-everything setups die because the sheet just fills with noise and you stop opening it. Filtering hard up front, even just a keyword list or a similarity cutoff, matters more than the plumbing does.

I should say I build a research-paper tool (Scholar Feed, an MCP server), so I'm biased toward the papers half. For general AI news it's honestly the wrong tool, RSS plus a summarize cron is what you want there.

---

## 2 · r/learnmachinelearning
**Thread:** [What do you do when staying informed competes with actual work?](https://www.reddit.com/r/learnmachinelearning/comments/1qmnew3/)
**Why:** Pain thread. Sell "calm," not FOMO. OP already mentions a tool (nbot), so tool mentions are welcome.

- [ ] Posted

What helped me was making it pull instead of push. I stopped browsing entirely. I keep a couple of narrow watches set up (specific labs, plus the two techniques my actual work depends on) and only look when one of them fires, which ends up being maybe twice a week instead of a daily anxiety scroll.

Most of the FOMO turned out to be a precision thing. The large majority of the daily flood just isn't relevant to whatever you're building, you've only trained yourself to feel like you should read it.

Since it's relevant: I build a tool that does the watch part inside Claude (Scholar Feed, CS/ML only). But the mindset change did more for me than the tool did. Haven't tried nbot, I'll take a look at it.

---

## 3 · r/MachineLearning
**Thread:** [[D] What apps or workflows do you use to keep up with reading AI/ML papers regularly?](https://www.reddit.com/r/MachineLearning/comments/1n6ir0a/)
**Why:** Recent, on-the-nose discovery + habit question.

- [ ] Posted

For finding papers, the thing that finally stuck was narrowing it to a few specific labs and a couple techniques instead of trying to follow a whole subfield. Scholar alerts are fine but noisy. Semantic Scholar's feed is a bit better since it's similarity based instead of keyword.

The reading habit was harder and no tool really fixed it for me. What helped a little was killing the context switch. I stopped opening a pile of PDF tabs and started reading them in my editor, since the tab juggling was what kept breaking the habit.

I'll admit some bias here, I built a small MCP server for that last part (Scholar Feed) that puts the search in Claude/Cursor next to whatever I'm writing. CS/ML only, free to try without an account. The narrowing-down part is the bit that actually mattered though, and that costs nothing.

---

## 4 · r/MachineLearning — evergreen (slow SEO, low live traffic)
**Thread:** [[D] How do you keep up with the flood of new ML papers and avoid getting scooped?](https://www.reddit.com/r/MachineLearning/comments/1lhv42l/)
**Why:** 11 months old. Ranks on Google for "keep up with ML papers." Comment compounds via search, not replies.

- [ ] Posted

There are kind of two separate problems tangled together here.

Keeping up: scholar alerts and arxiv-sanity get noisy fast because they're keyword based, so you spend most of your time skimming near-misses. What actually helped me was tracking specific labs plus the two or three techniques my work depends on, instead of a whole area. Way fewer hits and they're mostly relevant. Semantic Scholar's feed does a decent free version of this.

Getting scooped is more of a citation-graph thing than a feed thing imo. When something close to your idea shows up you want to see who's citing what, fast. Connected Papers and Research Rabbit are good for mapping a neighborhood once, but not for watching it over time.

Full disclosure, that watch-it-over-time gap annoyed me enough that I ended up building a tool for it (Scholar Feed, it's an MCP server so it runs in Claude/Cursor). CS/ML only, and the search works without an account if you want to poke at it. But honestly the biggest fix was just narrowing what I track. The flood is mostly a precision problem.

---

## 5 · r/MachineLearning — evergreen
**Thread:** [[D] What are your favorite tools for research?](https://www.reddit.com/r/MachineLearning/comments/1aml3w4/)
**Why:** Tool-recommendation thread; ranks for "ML research tools." Short add to an existing list.

- [ ] Posted

Solid list. I'd throw in a couple specifically for the keeping-up side, since connectedpapers and consensus are more for when you already have a paper in hand.

arxiv-sanity (Karpathy's) still works if you want a similarity feed of new stuff. And if you mostly live in Claude or Cursor, I built an MCP server (Scholar Feed) that puts arxiv search and citation tracing right in the editor so you're not tab hopping. CS/ML corpus only, free tier without an account.

paperparrot looks interesting, hadn't come across that one. Stealing it for my own setup.

---

## 6 · r/MachineLearning — evergreen
**Thread:** [[D] Favorite tips for staying up to date with AI/Deep Learning research and news?](https://www.reddit.com/r/MachineLearning/comments/122r3sr/)
**Why:** Evergreen "how to keep up" thread (links Raschka's blog). Ranks on Google.

- [ ] Posted

That Raschka writeup is still the best thing on this topic honestly. The one thing I'd add a couple years later is that the tooling finally caught up to his point 4. Scholar alerts and PapersWithCode still hold up, but similarity feeds (Semantic Scholar, arxiv-sanity) beat keyword alerts now, mostly because you stop drowning in near misses.

I went and built an MCP version of this so the search lives inside Claude/Cursor (Scholar Feed, CS/ML only, free without an account), so take that with the appropriate grain of salt. The habit part of his post is the genuinely hard part though, and I don't think any tool gets you out of that one.
