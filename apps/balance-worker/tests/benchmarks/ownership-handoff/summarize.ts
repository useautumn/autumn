/** Prints the markdown tables for run.ts output files: bun summarize.ts <json> [<json> ...]; several files merge their samples. */
export {};
type Output = {
	samples: {
		scenario: string;
		run: number;
		rebalancingAfterMs: number | null;
		rebalancingAfterConsumerStartMs: number | null;
		leaver: Record<string, number | null> | null;
		reconciliation?: {
			partition: number;
			ok: number;
			unknown: number;
			applied: number;
		}[];
		perPartition: {
			partition: number;
			from: string;
			to: string;
			gapUnownedToClaimedMs: number | null;
			windowUnownedToOkMs: number | null;
			windowWithdrawToOkMs: number | null;
			windowT0ToOkMs: number;
			startup: Record<string, number | null>;
		}[];
		traffic: {
			partition: number;
			counts: Record<string, number>;
			longestFailureRunMs: number;
			rawStatuses: Record<string, number>;
			straddlingWithdraw: Record<string, number>;
			probe: Record<string, number>;
			okLatencyMs: { p50: number | null; p99: number | null };
		}[];
		slots?: {
			ownershipRecords: Record<string, number>;
			claimsByFleet: Record<string, number>;
			longestDetourMs: number | null;
			flipObservedMs: { min: number; max: number } | null;
			greenPreparedPartitions: number;
			heartbeats: Record<
				string,
				{
					tasks: number;
					declaredActive: boolean[];
					ok: boolean;
					prepared: number;
					ready: number;
					admitted: number;
					total: number;
				} | null
			>;
		};
	}[];
	reconciliation: {
		partition: number;
		ok: number;
		unknown: number;
		applied: number;
	}[];
};
const files = process.argv.slice(2);
const outputs: Output[] = [];
for (const file of files) outputs.push(JSON.parse(await Bun.file(file).text()));
const data: Output = {
	samples: outputs.flatMap((output, index) =>
		output.samples.map((sample) => ({ ...sample, run: index + 1 })),
	),
	reconciliation: outputs.at(-1)?.reconciliation ?? [],
};
const slotsMode = data.samples.some((s) => s.slots);

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[mid]
		: Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const stat = (values: (number | null)[]) => {
	const real = values.filter((v): v is number => v !== null);
	return real.length
		? `${median(real)} / ${Math.max(...real)} (n=${real.length})`
		: "—";
};
const table = (headers: string[], rows: string[][]) =>
	[
		`| ${headers.join(" | ")} |`,
		`| ${headers.map(() => "---").join(" | ")} |`,
		...rows.map((r) => `| ${r.join(" | ")} |`),
	].join("\n");

const scenarios = slotsMode
	? [...new Set(data.samples.map((s) => s.scenario))].sort()
	: ["JOIN", "GRACEFUL_LEAVE", "HARD_KILL"];
if (slotsMode) {
	console.log(
		`\n### Blue-green steps (${outputs.length} passes, 4 partitions, 20 req/s per partition) — summed over passes\n`,
	);
	console.log(
		table(
			[
				"step",
				"client outcomes",
				"raw HTTP statuses",
				"longest failure run ms (median / max)",
				"longest detour ms (max)",
				"ownership records",
				"claims by fleet",
				"flip seen by green ms (min / max)",
				"green heartbeat at step end (prepared/ready/admitted/total, active)",
				"applied − 200s (per pass)",
			],
			scenarios.map((scenario) => {
				const samples = data.samples.filter((s) => s.scenario === scenario);
				const counts: Record<string, number> = {};
				const raw: Record<string, number> = {};
				const longest: number[] = [];
				for (const s of samples)
					for (const t of s.traffic) {
						for (const [k, v] of Object.entries(t.counts))
							counts[k] = (counts[k] ?? 0) + v;
						for (const [k, v] of Object.entries(t.rawStatuses))
							raw[k] = (raw[k] ?? 0) + v;
						longest.push(t.longestFailureRunMs);
					}
				const records: Record<string, number> = {};
				const claims: Record<string, number> = {};
				for (const s of samples) {
					for (const [k, v] of Object.entries(s.slots?.ownershipRecords ?? {}))
						records[k] = (records[k] ?? 0) + v;
					for (const [k, v] of Object.entries(s.slots?.claimsByFleet ?? {}))
						claims[k] = (claims[k] ?? 0) + v;
				}
				const detours = samples.map((s) => s.slots?.longestDetourMs ?? null);
				const flips = samples.map((s) => s.slots?.flipObservedMs ?? null);
				const seen = flips.filter((f) => f !== null);
				return [
					scenario,
					JSON.stringify(counts),
					JSON.stringify(raw),
					stat(longest),
					detours.some((d) => d !== null)
						? String(Math.max(...detours.map((d) => d ?? 0)))
						: "—",
					JSON.stringify(records),
					JSON.stringify(claims),
					seen.length
						? `${Math.min(...seen.map((f) => f.min))} / ${Math.max(...seen.map((f) => f.max))}`
						: "—",
					samples
						.map((s) => {
							const green = s.slots?.heartbeats.green;
							if (!green) return "—";
							return `${green.prepared}/${green.ready}/${green.admitted}/${green.total} (${green.tasks} tasks, active ${green.declaredActive.join(",")})`;
						})
						.join("; "),
					samples
						.map((s) =>
							(s.reconciliation ?? [])
								.map(
									(r) =>
										`${r.applied - r.ok}${r.unknown ? ` (unk ${r.unknown})` : ""}`,
								)
								.join(" "),
						)
						.join("; "),
				];
			}),
		),
	);
}

for (const scenario of scenarios) {
	const samples = data.samples.filter((s) => s.scenario === scenario);
	if (slotsMode && !samples.some((s) => s.perPartition.length > 0)) continue;
	console.log(
		`\n### ${scenario} (${samples.length} runs, 4 partitions each) — median / max in ms\n`,
	);
	console.log(
		table(
			[
				"metric",
				"partitions staying on A (A→A)",
				"partitions changing hands",
				"all",
			],
			[
				...(
					[
						"gapUnownedToClaimedMs",
						"windowUnownedToOkMs",
						"windowWithdrawToOkMs",
						"windowT0ToOkMs",
					] as const
				).map((key) => {
					const all = samples.flatMap((s) => s.perPartition);
					const stay = all.filter((p) => p.from === p.to);
					const move = all.filter((p) => p.from !== p.to);
					return [
						key,
						stat(stay.map((p) => p[key])),
						stat(move.map((p) => p[key])),
						stat(all.map((p) => p[key])),
					];
				}),
			],
		),
	);
	console.log(
		`\nRebalance detection: B start → A sees REBALANCING: ${stat(samples.map((s) => s.rebalancingAfterMs))}` +
			(scenario === "JOIN"
				? `; B consumer.start → A sees REBALANCING: ${stat(samples.map((s) => s.rebalancingAfterConsumerStartMs))}`
				: ""),
	);
	if (scenario === "GRACEFUL_LEAVE") {
		const keys = Object.keys(samples[0]?.leaver ?? {});
		console.log(
			`\nB's stop() timeline relative to SIGTERM (median / max ms): ${keys.map((k) => `${k}=${stat(samples.map((s) => s.leaver?.[k] ?? null))}`).join(", ")}`,
		);
	}
	console.log(
		"\nStartup breakdown of the new owner, per partition (median / max ms):\n",
	);
	const startupKeys = [
		"prepareMs",
		"announcedToActivateMs",
		"activateMs",
		"connectAndFenceMs",
		"bootstrapMs",
		"replayMs",
		"readyToClaimStartMs",
		"claimMs",
		"totalStartToClaimMs",
	];
	console.log(
		table(
			["step", ...startupKeys],
			[
				[
					"",
					...startupKeys.map((k) =>
						stat(
							samples.flatMap((s) =>
								s.perPartition.map((p) => p.startup[k] ?? null),
							),
						),
					),
				],
			],
		),
	);
	console.log(
		"\nClient traffic during the transition (20 req/s per partition, summed over runs):\n",
	);
	const counts: Record<string, number> = {};
	const raw: Record<string, number> = {};
	const longest: number[] = [];
	const longestMove: number[] = [];
	const longestStay: number[] = [];
	const straddle = { total: 0, ok: 0, notOwner: 0, other: 0 };
	const probe = {
		total: 0,
		straddling: 0,
		straddlingOk: 0,
		straddlingNotOwner: 0,
		straddlingOther: 0,
	};
	const p50: number[] = [];
	const p99: number[] = [];
	for (const s of samples)
		for (const t of s.traffic) {
			for (const [k, v] of Object.entries(t.counts))
				counts[k] = (counts[k] ?? 0) + v;
			for (const [k, v] of Object.entries(t.rawStatuses))
				raw[k] = (raw[k] ?? 0) + v;
			longest.push(t.longestFailureRunMs);
			const info = s.perPartition.find((p) => p.partition === t.partition);
			(info && info.from !== info.to ? longestMove : longestStay).push(
				t.longestFailureRunMs,
			);
			for (const k of Object.keys(straddle) as (keyof typeof straddle)[])
				straddle[k] += t.straddlingWithdraw[k] ?? 0;
			for (const k of Object.keys(probe) as (keyof typeof probe)[])
				probe[k] += t.probe[k] ?? 0;
			if (t.okLatencyMs.p50 !== null) p50.push(t.okLatencyMs.p50);
			if (t.okLatencyMs.p99 !== null) p99.push(t.okLatencyMs.p99);
		}
	console.log(
		table(
			["client outcome", "count"],
			Object.entries(counts)
				.sort((a, b) => b[1] - a[1])
				.map(([k, v]) => [k, String(v)]),
		),
	);
	console.log(
		`\nRaw HTTP statuses seen by the client's transport (hammer lane): ${JSON.stringify(raw)}`,
	);
	console.log(
		`Longest continuous failure run per partition (median / max ms): all ${stat(longest)}; A→A ${stat(longestStay)}; changing hands ${stat(longestMove)}`,
	);
	console.log(
		`Successful track latency during the window: p50 ${stat(p50)}, p99 ${stat(p99)}`,
	);
	console.log(
		`Hammer requests in flight at the old owner's withdraw: ${JSON.stringify(straddle)}`,
	);
	console.log(`Back-to-back probe lane: ${JSON.stringify(probe)}`);
}
console.log("\n### Reconciliation (every 200 durably applied)\n");
console.log(
	table(
		[
			"partition",
			"client 200s (whole session)",
			"unknown outcomes (DEADLINE/TRANSPORT)",
			"balance decrement in Postgres",
			"applied − 200s",
		],
		data.reconciliation.map((r) => [
			String(r.partition),
			String(r.ok),
			String(r.unknown),
			String(r.applied),
			String(r.applied - r.ok),
		]),
	),
);
console.log(
	"\nPer scenario (cumulative applied − 200s after each transition, partitions 0..3):\n",
);
console.log(
	table(
		["scenario #run", "p0", "p1", "p2", "p3"],
		data.samples
			.filter((s) => s.reconciliation)
			.map((s) => [
				`${s.scenario} #${s.run}`,
				...(s.reconciliation ?? []).map(
					(r) => `${r.applied - r.ok} (unk ${r.unknown})`,
				),
			]),
	),
);
