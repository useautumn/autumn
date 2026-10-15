// Usage: bun leaderChurnSummarize.ts <file.json>... : one markdown row per leaderChurn.ts run (its stdout).
const header = [
	"run",
	"scenario",
	"requests",
	"failed (by outcome)",
	"churn failed",
	"crashes (owner:restart)",
	"fleet joins churn/after",
	"re-prepares churn/after",
	"routing failed / unroutable samples",
	"recovery ms",
	"max unserved ms",
	"reconciled",
	"applied but client failed",
];
console.log(`| ${header.join(" | ")} |`);
console.log(`|${header.map(() => "---").join("|")}|`);
for (const file of process.argv.slice(2)) {
	const text = await Bun.file(file).text();
	const start = text.indexOf("{\n");
	const label = file
		.split("/")
		.at(-1)
		?.replace(/\.json$/, "");
	if (start < 0) {
		console.log(`| ${label} | no summary |`);
		continue;
	}
	const s = JSON.parse(text.slice(start, text.indexOf("\n}", start) + 2));
	const churn: Record<string, number> = s.outcomesByPhase.churn ?? {};
	const churnTotal = Object.values(churn).reduce((a, b) => a + b, 0);
	const fmt = (o: Record<string, number>) =>
		Object.entries(o)
			.map(([k, v]) => `${k}:${v}`)
			.join(" ") || "none";
	const r = s.reconciliation;
	console.log(
		`| ${[
			label,
			s.config.SCENARIO,
			s.totals.requests,
			`${s.totals.failed} (${fmt(s.totals.failedByOutcome)})`,
			`${churnTotal - (churn["200"] ?? 0)}/${churnTotal}`,
			`${s.crashes} (${fmt(s.crashesByOwner)})`,
			`${s.groupJoins.churn ?? 0}/${s.groupJoins.after ?? 0}`,
			`${s.prepares.churn ?? 0}/${s.prepares.after ?? 0}`,
			`${s.routingFailures} / ${s.routing.samplesWithError + s.routing.samplesWithUnownedRoutedPartition}`,
			s.recovery.recoveryMs ?? "not recovered",
			s.maxUnservedMsDuringChurn,
			r.ok
				? `ok (${r.clientSuccesses} successes, ${r.loggedApplied} applied, 0 dup)`
				: `FAIL missing=${r.successMissingFromLog} dup=${r.commandIdsLoggedTwice} balanceMismatch=${Object.keys(r.balanceMismatches).length} bookmarkLag=${Object.keys(r.postgresBookmarkLag).length} unreadable=${r.unreadableRecords}`,
			fmt(r.appliedButClientFailed),
		].join(" | ")} |`,
	);
}
export {};
