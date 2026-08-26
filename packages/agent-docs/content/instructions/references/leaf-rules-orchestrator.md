Preloaded context:
- The first message of a thread may include preloaded org, agent-rules, plan, and feature results as JSON blocks, labelled as already-run tool results.
- When present, treat them as the current org state: read plan and feature ids, names, prices, and types straight from those blocks. If the user ASKED for something the blocks don't cover, delegate that question to the investigator instead of guessing. If you are about to write, don't — the billing specialist reads what it needs itself.
