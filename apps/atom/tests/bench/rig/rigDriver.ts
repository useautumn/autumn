/**
 * Driver box: starts the Autumn stub, registers the tenant on both replicas, seeds every customer through the stub,
 * then runs the load processes and records per-step driver stats and every replica's /health to JSONL.
 * `bun run rig:driver --replicas <ipA>,<ipB> [--out <dir>]`.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { rigConfig } from "./rigConfig.js";
import {
	customerIdsOf,
	drawCustomerRate,
	emptyCounts,
	mergeCounts,
	percentileOf,
	type StepCounts,
	timelineOf,
} from "./rigShared.js";

const { values } = parseArgs({
	options: { replicas: { type: "string" }, out: { type: "string" } },
});
const replicaIps = (values.replicas ?? "").split(",").filter(Boolean);
if (replicaIps.length !== 2)
	throw new Error("Usage: rig:driver --replicas <replica A IP>,<replica B IP>");
const config = rigConfig;
const replicaUrls = replicaIps.map(
	(ip) => `http://${ip}:${config.replica.port}`,
);
const outDir =
	values.out ??
	join(
		homedir(),
		"atom-rig",
		"runs",
		new Date().toISOString().replaceAll(":", "-"),
	);
mkdirSync(outDir, { recursive: true });
const writeLine = (file: string, line: unknown) =>
	appendFileSync(join(outDir, file), `${JSON.stringify(line)}\n`);
const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const log = (message: string) =>
	console.log(`[${new Date().toISOString()}] ${message}`);

const until = async (what: string, ready: () => Promise<boolean>) => {
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		if (await ready().catch(() => false)) return;
		await Bun.sleep(500);
	}
	throw new Error(`${what} was not ready within 120 s`);
};

const stub = Bun.spawn(
	[
		process.execPath,
		join(import.meta.dir, "rigAutumn.ts"),
		replicaUrls.join(","),
	],
	{ stdout: "inherit", stderr: "inherit" },
);
process.on("exit", () => stub.kill());
const stubUrl = `http://127.0.0.1:${config.stub.port}`;
await until(
	"The Autumn stub",
	async () => (await fetch(`${stubUrl}/__rig/stats`)).ok,
);
for (const url of replicaUrls)
	await until(url, async () => (await fetch(`${url}/health`)).status === 200);

for (const url of replicaUrls) {
	const reply = await fetch(`${url}/v1/atoms.put`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-admin-token": config.tenant.adminToken,
		},
		body: JSON.stringify({
			id: config.tenant.atomId,
			token_hash: sha256(config.tenant.token),
		}),
	});
	if (!reply.ok)
		throw new Error(
			`atoms.put on ${url}: ${reply.status} ${await reply.text()}`,
		);
}
log(`tenant ${config.tenant.atomId} registered on ${replicaUrls.join(", ")}`);

const seededAt = Date.now();
const seeded = await (
	await fetch(`${stubUrl}/__rig/seed`, { method: "POST" })
).json();
log(
	`seeded ${seeded.seeded} customers in ${((Date.now() - seededAt) / 1000).toFixed(1)} s`,
);
await Bun.sleep(5_000);

const background = customerIdsOf({ config }).filter(
	(id) => id !== config.customers.hotCustomerId,
);
const draws = background.map(() =>
	drawCustomerRate(config.background.ratePerCustomer),
);
const drawn = draws.reduce((sum, rate) => sum + rate, 0);
const scale = config.background.deductionsPerSec / drawn;
const startAt = Date.now() + 3_000;
const loads = Array.from({ length: config.loadProcesses }, (_, index) => {
	const slice = background.flatMap((id, i) =>
		i % config.loadProcesses === index
			? [{ id, rate: (draws[i] as number) * scale }]
			: [],
	);
	const planPath = join(outDir, `load-plan-${index}.json`);
	writeFileSync(
		planPath,
		JSON.stringify({
			replicaUrls,
			startAt,
			processCount: config.loadProcesses,
			customerIds: slice.map(({ id }) => id),
			deductionsPerSec: slice.map(({ rate }) => rate),
		}),
	);
	return Bun.spawn(
		[process.execPath, join(import.meta.dir, "rigLoad.ts"), planPath],
		{
			stdout: "pipe",
			stderr: "inherit",
		},
	);
});

const timeline = timelineOf({ config });
writeFileSync(
	join(outDir, "meta.json"),
	JSON.stringify(
		{
			variant: config.variant,
			gitSha: Bun.spawnSync(["git", "rev-parse", "HEAD"])
				.stdout.toString()
				.trim(),
			driverBun: Bun.revision,
			replicaUrls,
			startAt: new Date(startAt).toISOString(),
			steps: timeline.steps,
			config,
		},
		null,
		2,
	),
);

const healthPolls = setInterval(async () => {
	const elapsedS = (Date.now() - startAt) / 1000;
	for (const url of replicaUrls) {
		const health = await fetch(`${url}/health`)
			.then((reply) => reply.json())
			.catch((error) => ({ error: String(error) }));
		writeLine("health.jsonl", {
			at: new Date().toISOString(),
			elapsedS,
			step: timeline.stepAt(elapsedS),
			replica: url,
			health,
		});
	}
}, config.healthEveryMs);

const reported = new Map<
	number,
	{ hot: StepCounts; others: StepCounts; from: number }
>();
const summaryOf = (counts: StepCounts) => ({
	perSec: Math.round(counts.sent / config.hot.stepSeconds),
	answeredShare: counts.sent
		? Number((counts.answered / counts.sent).toFixed(4))
		: null,
	forwarded: counts.forwarded,
	shed: counts.shed,
	failed: counts.failed,
	p50Ms: percentileOf({ histogram: counts.histogram, p: 0.5 }),
	p99Ms: percentileOf({ histogram: counts.histogram, p: 0.99 }),
	forwardReasons: counts.forwardReasons,
});
const receiveStep = (line: {
	step: number;
	hot: StepCounts;
	others: StepCounts;
}) => {
	const held = reported.get(line.step) ?? {
		hot: emptyCounts(),
		others: emptyCounts(),
		from: 0,
	};
	mergeCounts(held.hot, line.hot);
	mergeCounts(held.others, line.others);
	held.from++;
	reported.set(line.step, held);
	if (held.from < config.loadProcesses) return;
	const step = timeline.steps[line.step];
	const row = {
		step: line.step,
		multiple: step?.multiple,
		hotTargetPerSec: step?.hotDeductionsPerSec,
		hot: summaryOf(held.hot),
		others: summaryOf(held.others),
	};
	writeLine("steps.jsonl", row);
	log(
		`step ${row.step} (${row.multiple}×, hot ${row.hotTargetPerSec}/s): hot ${row.hot.perSec} req/s answered ${row.hot.answeredShare} p99 ${row.hot.p99Ms} ms shed ${row.hot.shed} fwd ${row.hot.forwarded} | others ${row.others.perSec} req/s answered ${row.others.answeredShare} p99 ${row.others.p99Ms} ms shed ${row.others.shed}`,
	);
};

await Promise.all(
	loads.map(async (load) => {
		let buffered = "";
		for await (const chunk of load.stdout) {
			buffered += new TextDecoder().decode(chunk);
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const text of lines) {
				const line = JSON.parse(text);
				if (line.type === "step") receiveStep(line);
			}
		}
		await load.exited;
	}),
);
clearInterval(healthPolls);
writeLine("stub.jsonl", await (await fetch(`${stubUrl}/__rig/stats`)).json());
log(`done: ${outDir}/{meta.json,steps.jsonl,health.jsonl,stub.jsonl}`);
stub.kill();
process.exit(0);
