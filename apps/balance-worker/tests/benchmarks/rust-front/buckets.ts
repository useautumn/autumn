// Buckets a Bun .cpuprofile's main-thread samples into plumbing vs decide: each sample goes to the first
// categorised frame walking from the leaf to the root. Proportions only (the profiler inflates absolute time).
const file = process.argv[2];
if (!file) throw new Error("usage: buckets.ts <file.cpuprofile>");
const prof = JSON.parse(await Bun.file(file).text());
const nodes = new Map<number, any>();
for (const n of prof.nodes) nodes.set(n.id, n);
const parent = new Map<number, number>();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

type Bucket = [name: string, test: (fn: string, url: string) => boolean];
const BUCKETS: Bucket[] = [
	["request log (pino, 5% sample)", (_f, u) => /pino|sonic-boom|thread-stream|requestLoggingMiddleware/.test(u)],
	["kafka produce (kafkajs encode, txn, gzip)", (_f, u) => /kafkajs|packages\/kafka\/src\/producer|createWorkerProducer|zlib/.test(u)],
	["record encode (JSON → bytes)", (_f, u) => /topicEnvelope|meteringTopic|createMutationPublisher|createSpikeWorker/.test(u)],
	["reply serialise (exact bytes)", (_f, u) => /serializeSubjectReply/.test(u)],
	["IPC frames (decode, encode, write)", (f, u) => /serveDecideCore/.test(u) && /handleDecide|onData|flushResults|send|drain|data|handleAck|remoteAppend/.test(f)],
	["HTTP (Bun.serve, fast path, routing)", (_f, u) => /fastPath|resolveRequestRuntime|withRequestBudget|looksLikeCommands|contracts\/worker|hono/.test(u)],
	["writer bookkeeping (queue, commit, settle, receipts)", (_f, u) => /processor\/writer|recentCommands|subjectMap|committer|runtime\//.test(u)],
	["decide (engine, track/check, effects, reply shape)", (_f, u) => /balance-engine|processor\/|auto-topup|balance-webhooks|common\/usageEvent|decimal\.js/.test(u)],
	["command parse + per-request glue", (f, u) => /serveDecideCore/.test(u)],
];

const counts = new Map<string, number>();
let total = 0;
for (const sample of prof.samples) {
	total++;
	let bucket = "unattributed (native/GC/idle)";
	let cur: number | undefined = sample;
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
	if (bucket === "unattributed (native/GC/idle)") {
		const leaf = nodes.get(sample).callFrame.functionName;
		if (leaf === "(idle)" || leaf === "(program)") bucket = "idle/program";
	}
	counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
}
const idle = counts.get("idle/program") ?? 0;
console.log(`${file.split("/").pop()}: ${total} samples, ${idle} idle`);
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
	if (name === "idle/program") continue;
	console.log(`${((n / (total - idle)) * 100).toFixed(1).padStart(5)}%  ${name}`);
}
