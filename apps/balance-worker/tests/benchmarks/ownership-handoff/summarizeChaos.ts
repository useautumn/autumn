// Usage: bun summarizeChaos.ts <label>... (reads $CHAOS_OUT or ~/.capy/work/chaos/<label>.json); one markdown row per run.
const dir = process.env.CHAOS_OUT ?? `${process.env.HOME}/.capy/work/chaos`;
console.log(
	"| run | target | total | failed | failed by code (fault+after) | crashes (restart) | joins f/a | prepares f/a | routing rebuilds | recovery ms | reconcile |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const label of process.argv.slice(2)) {
	const file = Bun.file(`${dir}/${label}.json`);
	if (!(await file.exists())) {
		console.log(`| ${label} | no summary |||||||||| `);
		continue;
	}
	const s = await file.json();
	const codes: Record<string, number> = {};
	for (const p of ["fault", "after"])
		for (const [k, v] of Object.entries(s.outcomesByPhase[p] ?? {}))
			if (k !== "200") codes[k] = (codes[k] ?? 0) + (v as number);
	const baselineFailed = Object.entries(s.outcomesByPhase.baseline ?? {})
		.filter(([k]) => k !== "200")
		.reduce((a, [, v]) => a + (v as number), 0);
	const crashes = s.crashes as { restart?: boolean }[];
	const crashText = crashes.length
		? `${crashes.length} (${crashes.filter((c) => c.restart).length}t/${crashes.filter((c) => c.restart === false).length}f)`
		: "0";
	const r = s.reconciliation;
	const rec = r.ok
		? `OK (${r.clientSucceeded} ok, ${r.failedButDeducted} failed-but-landed)`
		: `**MISMATCH** missing=${r.succeededMissingFromLog} dup=${r.duplicatedCommandIds} unknown=${r.unknownCommandIdsInLog} pgMismatch=${r.customersMismatched.length} complete=${r.logReadComplete}`;
	const t = s.target;
	console.log(
		[
			"",
			label,
			`${t.target}${t.targetIsWorkerCoordinator ? " (coord)" : ""}, leads ${t.affectedPartitions.length}`,
			s.totalRequests,
			`${s.failedRequests}${baselineFailed ? ` (${baselineFailed} baseline)` : ""}`,
			Object.entries(codes)
				.map(([k, v]) => `${k}:${v}`)
				.join(" ") || "none",
			crashText,
			`${s.groupJoins.fault ?? 0}/${s.groupJoins.after ?? 0}`,
			`${s.prepares.fault ?? 0}/${s.prepares.after ?? 0}`,
			s.routingConsumerRebuilds,
			s.recovery.recovered
				? s.recovery.recoveryMs
				: `**not recovered** (${s.recovery.recoveryMs})`,
			rec,
			"",
		].join(" | "),
	);
}
export {};
