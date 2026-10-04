export {};
// Buckets a Bun .cpuprofile's samples: each sample goes to the first categorised frame from the leaf up.
// Proportions only (the profiler inflates absolute time). Usage: bun buckets.ts <file.cpuprofile> [--top N]
const file = process.argv[2];
if (!file) throw new Error("usage: buckets.ts <file.cpuprofile> [--top N]");
const topN = Number(process.argv[process.argv.indexOf("--top") + 1] || 0) || 0;
const prof = JSON.parse(await Bun.file(file).text());
// biome-ignore lint/suspicious/noExplicitAny: profiler nodes are untyped
const nodes = new Map<number, any>();
for (const n of prof.nodes) nodes.set(n.id, n);
const parent = new Map<number, number>();
for (const n of prof.nodes)
	for (const c of n.children ?? []) parent.set(c, n.id);

type Bucket = [name: string, test: (fn: string, url: string) => boolean];
const BUCKETS: Bucket[] = [
	[
		"ring + frames (claim/publish/flush, utf8 encode/decode)",
		(f, u) =>
			/serial-decide\/ring\.ts/.test(u) ||
			(/serial-decide\/sequencer\.ts/.test(u) &&
				/writeResult|writeRecord|drainCommands|drainAcks|flushDirty|settle|emit|append/.test(
					f,
				)),
	],
	[
		"reply serialise (slimReplySubject + serializeSubjectReply)",
		(_f, u) =>
			/serializeSubjectReply|slimReplySubject|slimSubjectForFeatures/.test(u),
	],
	[
		"record encode (mutationToRecord, serializeMeteringRecord)",
		(_f, u) =>
			/topicEnvelope|meteringTopic|mutationToRecord|commandToFingerprint|canonicalizeJson/.test(
				u,
			),
	],
	[
		"dedup + projection + bookkeeping (lean)",
		(f, u) =>
			/serial-decide\/coreLean\.ts/.test(u) &&
			/onAck|decideResident|decide\b|decideTrack|wrapErrors/.test(f) &&
			false,
	],
	[
		"subject map / recent commands (writer state)",
		(_f, u) =>
			/subjectMap|recentCommands|pendingMutations|processor\/writer/.test(u),
	],
	[
		"decide: engine (computeTrackDecision, applyMutation, draw)",
		(_f, u) => /balance-engine|decimal\.js/.test(u),
	],
	[
		"decide: processor glue (track.ts mutateTrack, hydrator, subjectDecisions, effects)",
		(_f, u) =>
			/processor\/commands\/track|subjectHydrator|subjectDecisions|processor\/effects|processor\/subject|auto-topup|balance-webhooks|usageEvent/.test(
				u,
			),
	],
	[
		"command parse (JSON.parse, looksLike*)",
		(f, u) => /looksLikeCommands/.test(u) || (f === "parse" && /JSON/.test(u)),
	],
	[
		"kafka client (should be ~0 on the sequencer)",
		(_f, u) => /kafkajs|packages\/kafka\/src\/producer|zlib/.test(u),
	],
	[
		"lean core glue (coreLean.ts own frames)",
		(_f, u) => /serial-decide\/coreLean\.ts/.test(u),
	],
	["sequencer loop glue", (_f, u) => /serial-decide\/sequencer\.ts/.test(u)],
	[
		"processor core (coreProcessor.ts, fast path, runtime, runs, acceptedCommands)",
		(_f, u) =>
			/serial-decide\/coreProcessor\.ts|fastPath|resolveRequestRuntime|withRequestBudget|processor\/runs|acceptedCommands|createSpikeWorker/.test(
				u,
			),
	],
	[
		"logging (pino)",
		(_f, u) => /pino|sonic-boom|thread-stream|requestLoggingMiddleware/.test(u),
	],
];

const counts = new Map<string, number>();
const leafCounts = new Map<string, number>();
let total = 0;
for (const sample of prof.samples) {
	total++;
	let bucket = "unattributed (native/GC)";
	let cur: number | undefined = sample;
	const leafNode = nodes.get(sample);
	const leafName = `${leafNode.callFrame.functionName || "(anon)"} @ ${(leafNode.callFrame.url || "").split("/").slice(-2).join("/")}`;
	while (cur !== undefined) {
		const n = nodes.get(cur);
		const url: string = n.callFrame.url ?? "";
		const fn: string = n.callFrame.functionName ?? "";
		const hit = url ? BUCKETS.find(([, test]) => test(fn, url)) : undefined;
		if (hit) {
			bucket = hit[0];
			break;
		}
		cur = parent.get(cur);
	}
	if (bucket === "unattributed (native/GC)") {
		const leaf = leafNode.callFrame.functionName;
		if (leaf === "(idle)" || leaf === "(program)") bucket = "idle/program";
		else leafCounts.set(leafName, (leafCounts.get(leafName) ?? 0) + 1);
	}
	counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
}
const idle = counts.get("idle/program") ?? 0;
console.log(`${file.split("/").pop()}: ${total} samples, ${idle} idle/program`);
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
	if (name === "idle/program") continue;
	console.log(
		`${((n / (total - idle)) * 100).toFixed(1).padStart(5)}%  ${name}`,
	);
}
if (topN > 0) {
	console.log("\nunattributed leaves:");
	for (const [name, n] of [...leafCounts]
		.sort((a, b) => b[1] - a[1])
		.slice(0, topN))
		console.log(
			`${((n / (total - idle)) * 100).toFixed(1).padStart(5)}%  ${name}`,
		);
}
