# Run ETA

`estimateRunEta` gives a live run's remaining wall time as a median (`etaMs`) and a slow case (`etaP90Ms`). The swarm job recomputes it every 5s and publishes it as an `eta` run event. `GET /runs/:id` and MCP `get_run` return the latest value.

1. **Expected duration per file.** Use the file's `file_baselines` p50 (p90 for the slow case). If the file has no baseline, use the median of its folder's baselines, then the global median. If there are no baselines at all, use this run's own finished durations.
2. **Speed factor.** For each passed file, divide its observed duration by its expected duration. Smooth those ratios with an EWMA (α 0.2, starting at 1) and clamp the result to 0.5–3. Multiply every expectation by the factor.
3. **Running files.** Remaining time is `expected − elapsed`. Once a file runs past its estimate, switch to the p90 tail. Never go below 10s.
4. **Scheduling.** Pack the remaining files longest-first onto the earliest free worker. Busy workers are free once their current file ends, booting workers after half the boot p50, and workers still wanted (the account shortfall) after the boot p50. The makespan is when the last worker finishes.
5. **Retries and teardown.** Each first attempt adds `failure rate × duration` for a possible retry. Recent teardown p50 is added at the end. Boot and teardown p50 come from the last 10 finished runs.

The ETA is null until 5 files have finished; the UI shows "estimating…" until then. The client counts down between updates and moves the shown value at most ~20% (or 5s) toward each new estimate, so it never jumps.
