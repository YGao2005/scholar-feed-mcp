# Reddit — organic comments + demo post

Complements `launch-posts.md` (which holds the *announcement* posts: r/LocalLLaMA
show-and-tell, Show HN, X, Discord). This file is the slower, lower-key organic
layer: disclosed value-first **comments** on existing threads, and one
**demo-driven post** in a different format than the announcement.

## Operating rules (read once)

- **Account:** use the aged 8-year personal account. Age clears the auto-spam
  filters; 131 karma is fine for comments. Bank a little karma with no-link
  helpful comments before the posts.
- **Disclose every time.** "Full disclosure, I built this." On Reddit, disclosed
  outperforms stealth, and stealth that gets caught is brand-poison.
- **Corpus-fit filter:** Scholar Feed is CS/AI/ML only. Only recommend it where
  the audience is CS/ML. In a field-agnostic thread, either hedge hard ("if
  you're in CS/ML…") or skip. Recommending it to a historian is how you get
  flagged.
- **Comment > link-drop.** Lead by answering the actual question and naming real
  alternatives (Connected Papers, Research Rabbit, Semantic Scholar, arxiv-sanity,
  paperparrot) honestly. Mention Scholar Feed as one option, with its limits.
- **Pace:** a few per week across subs, not a blitz. Don't link in every comment.
- **You post manually** from your account. Run each draft through `/humanizer`
  first (Reddit punishes AI tells harder than anywhere). I draft; you send.

## Comment backlog (CS/ML-fit threads)

| Thread | Sub | Status |
|---|---|---|
| [How do you keep up with the flood of new ML papers and avoid getting scooped?](https://old.reddit.com/r/MachineLearning/comments/1lhv42l/) | r/ML | drafted ↓ |
| [What apps/workflows do you use to keep up with reading AI/ML papers?](https://old.reddit.com/r/MachineLearning/comments/1n6ir0a/) | r/ML | drafted ↓ |
| [What are your favorite tools for research?](https://old.reddit.com/r/MachineLearning/comments/1aml3w4/) | r/ML | drafted ↓ |
| [Favorite tips for staying up to date with AI/DL research?](https://old.reddit.com/r/MachineLearning/comments/122r3sr/) | r/ML | drafted ↓ |
| [What do you do when staying informed competes with actual work?](https://old.reddit.com/r/learnmachinelearning/comments/1qmnew3/) | r/learnML | drafted ↓ |
| [How do you automatically track new AI research into Notion/a spreadsheet?](https://old.reddit.com/r/MLQuestions/comments/1rpf0i6/) | r/MLQuestions | drafted ↓ (honest "wrong tool for news" angle) |

Skipped (field-agnostic, corpus mismatch): r/AskAcademia "proper research tools
HELP" (history major, wants images), "Do you track papers like books?".

---

## Comment drafts — humanized, send-ready

Ran through /humanizer. The cross-comment tell mattered most: six comments from
one account that all run advice → "Disclosure: I built X" → "but the real fix
needs no tool" read as a template on a profile skim. So the disclosure wording
and the closers are varied below. Post from your own account; don't paste all six
the same day (that itself looks like a campaign).

**Posting order — fresh/active threads first** (they're still getting traffic;
old ones are slow SEO drip): 1) r/MLQuestions 1rpf0i6 · 2) r/learnML 1qmnew3 ·
3) r/ML 1n6ir0a · then the three evergreen r/ML threads over the following week.
Bank a couple of no-link helpful comments somewhere first.

### r/ML — keep up / avoid getting scooped (1lhv42l)
> There are kind of two separate problems tangled together here.
>
> Keeping up: scholar alerts and arxiv-sanity get noisy fast because they're keyword based, so you spend most of your time skimming near-misses. What actually helped me was tracking specific labs plus the two or three techniques my work depends on, instead of a whole area. Way fewer hits and they're mostly relevant. Semantic Scholar's feed does a decent free version of this.
>
> Getting scooped is more of a citation-graph thing than a feed thing imo. When something close to your idea shows up you want to see who's citing what, fast. Connected Papers and Research Rabbit are good for mapping a neighborhood once, but not for watching it over time.
>
> Full disclosure, that watch-it-over-time gap annoyed me enough that I ended up building a tool for it (Scholar Feed, it's an MCP server so it runs in Claude/Cursor). CS/ML only, and the search works without an account if you want to poke at it. But honestly the biggest fix was just narrowing what I track. The flood is mostly a precision problem.

### r/ML — apps/workflows to track + actually read papers (1n6ir0a)
> For finding papers, the thing that finally stuck was narrowing it to a few specific labs and a couple techniques instead of trying to follow a whole subfield. Scholar alerts are fine but noisy. Semantic Scholar's feed is a bit better since it's similarity based instead of keyword.
>
> The reading habit was harder and no tool really fixed it for me. What helped a little was killing the context switch. I stopped opening a pile of PDF tabs and started reading them in my editor, since the tab juggling was what kept breaking the habit.
>
> I'll admit some bias here, I built a small MCP server for that last part (Scholar Feed) that puts the search in Claude/Cursor next to whatever I'm writing. CS/ML only, free to try without an account. The narrowing-down part is the bit that actually mattered though, and that costs nothing.

### r/ML — favorite tools for research (1aml3w4)
> Solid list. I'd throw in a couple specifically for the keeping-up side, since connectedpapers and consensus are more for when you already have a paper in hand.
>
> arxiv-sanity (Karpathy's) still works if you want a similarity feed of new stuff. And if you mostly live in Claude or Cursor, I built an MCP server (Scholar Feed) that puts arxiv search and citation tracing right in the editor so you're not tab hopping. CS/ML corpus only, free tier without an account.
>
> paperparrot looks interesting, hadn't come across that one. Stealing it for my own setup.

### r/ML — tips for staying up to date (122r3sr)
> That Raschka writeup is still the best thing on this topic honestly. The one thing I'd add a couple years later is that the tooling finally caught up to his point 4. Scholar alerts and PapersWithCode still hold up, but similarity feeds (Semantic Scholar, arxiv-sanity) beat keyword alerts now, mostly because you stop drowning in near misses.
>
> I went and built an MCP version of this so the search lives inside Claude/Cursor (Scholar Feed, CS/ML only, free without an account), so take that with the appropriate grain of salt. The habit part of his post is the genuinely hard part though, and I don't think any tool gets you out of that one.

### r/learnML — staying informed vs doing work (1qmnew3)
> What helped me was making it pull instead of push. I stopped browsing entirely. I keep a couple of narrow watches set up (specific labs, plus the two techniques my actual work depends on) and only look when one of them fires, which ends up being maybe twice a week instead of a daily anxiety scroll.
>
> Most of the FOMO turned out to be a precision thing. The large majority of the daily flood just isn't relevant to whatever you're building, you've only trained yourself to feel like you should read it.
>
> Since it's relevant: I build a tool that does the watch part inside Claude (Scholar Feed, CS/ML only). But the mindset change did more for me than the tool did. Haven't tried nbot, I'll take a look at it.

### r/MLQuestions — auto-track AI research into Notion/Sheet (1rpf0i6)
*(Honest "partly the wrong tool" answer — builds credibility, post this one first.)*
> For the papers side of this there are pretty clean inputs. arxiv has a per-category RSS/Atom feed you can pipe straight into a sheet, and Semantic Scholar's API will give you summaries. The compute and infra news side is messier since that's mostly blogs and press releases, so for that you'd want RSS plus an LLM summarize step. A little cron calling the OpenAI or Anthropic API into Notion does the job, you don't really need Zapier.
>
> One warning from doing this myself: most track-everything setups die because the sheet just fills with noise and you stop opening it. Filtering hard up front, even just a keyword list or a similarity cutoff, matters more than the plumbing does.
>
> I should say I build a research-paper tool (Scholar Feed, an MCP server), so I'm biased toward the papers half. For general AI news it's honestly the wrong tool, RSS plus a summarize cron is what you want there.

---

## Demo-driven post (NOT the announcement — a different format)

The viral template proven by [r/artificial "I gave an AI coding agent access to 2M
research papers"](https://old.reddit.com/r/artificial/comments/1s6afwm/) and
[r/learnML "I was tired of drowning in arXiv so I built…"](https://old.reddit.com/r/learnmachinelearning/comments/1sdqztg/).
Curiosity-gap title, a real demo with a concrete payoff, tool disclosed at the
end. The payoff below is a **real** result from the live corpus (anonymous tools,
reproducible by the reader), not a fabrication.

**Best subs:** r/MachineLearning (flair `[P]`), r/artificial, r/LocalLLaMA.
Check each sub's self-promo rules first; reply fast in comments (that's what
carries it).

**Title:**
> I gave Claude a 600k-paper search index and asked for ways to shrink the LLM KV cache. It surfaced a paper arguing the cache shouldn't exist.

**Body:**
> I do a lot of literature review and got curious whether semantic search over a big paper corpus would beat my usual keyword-on-arXiv habit for finding non-obvious ideas. So I wired a 600k CS/AI/ML index into Claude (as an MCP server) and gave it a concrete, narrow problem: reduce the memory the KV cache eats during long-context inference.
>
> Keyword search for "KV cache compression" gives you the fifty papers literally titled that — quantization, eviction, low-rank, all incremental variations on "store the cache, but smaller."
>
> Semantic search surfaced three things I wouldn't have typed my way to:
>
> 1. **"The Residual Stream Is All You Need: On the Redundancy of the KV Cache"** (arXiv 2603.19664). It argues the cache is *redundant* rather than compressible — keys and values can be recomputed from the residual stream, and their scheme cuts peak memory ~59% while keeping 100% token match where baselines degrade. The interesting part is the framing: it never sells itself as "compression," so a keyword search for compression buries it.
> 2. **HashEvict** (arXiv 2412.16187), which borrows locality-sensitive hashing straight from the classic hashing/`cs.DS` literature to decide what to evict pre-attention.
> 3. A Shannon-limit **probabilistic-tries** approach (arXiv 2604.15356) pulling from information theory and delta coding.
>
> The pattern that stuck with me: the best idea for your problem is often filed under a word you didn't search. The "redundancy" paper is a different *concept* than "compression," so keyword matching can't reach it, but semantic search lands right on it. That's the case for letting an assistant search by meaning over a real corpus instead of you guessing keywords.
>
> Honest caveats: these are recent preprints with low citation counts, so treat the claims as unvetted (I haven't reproduced the 59% myself). The novelty scores I filtered on are LLM-generated, useful as a filter, not ground truth. Coverage is CS/AI/ML only.
>
> Disclosure: the index is a thing I built (Scholar Feed, an open-source MCP server). The search and orientation tools I used here run anonymously with no account, so if you want to reproduce the exact query: `npx scholar-feed-mcp init`, then ask it to orient on "memory-efficient KV cache" and search semantically for cross-domain approaches. Repo: github.com/YGao2005/scholar-feed-mcp. Genuinely curious whether other people's keyword habits are hiding better papers from them too.

**Accuracy check before posting** (same discipline as launch-posts.md):
- [ ] arXiv IDs correct: 2603.19664, 2412.16187, 2604.15356.
- [ ] "~59% peak memory, 100% token match" matches the paper's abstract claim (it's *their* claim, stated as such).
- [ ] Caveats paragraph kept (unvetted preprints, LLM novelty score, CS/ML-only).
- [ ] Corpus = 600,000+, install = `npx scholar-feed-mcp init`, anonymous = no account.
- [ ] Run through /humanizer. Flair correctly. Reply to comments fast.
