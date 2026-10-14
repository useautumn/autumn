/**
 * One of the driver's load processes: its slice of the background customers at their weights, and its share of the hot
 * customer, sent to a random replica each. Prints one JSON line per finished step. Spawned by rig:driver.
 */
import { LATEST_VERSION } from "@autumn/shared";
import { rigConfig } from "./rigConfig.js";
import {
	bucketOf,
	emptyCounts,
	type StepCounts,
	timelineOf,
} from "./rigShared.js";

type LoadPlan = {
	replicaUrls: string[];
	startAt: number;
	processCount: number;
	customerIds: string[];
	/** Each customer's background deductions/s at the peak, already scaled to this slice's share. */
	deductionsPerSec: number[];
};

const plan: LoadPlan = await Bun.file(process.argv[2] as string).json();
const config = rigConfig;
const timeline = timelineOf({ config });
const cumulative: number[] = [];
let total = 0;
for (const rate of plan.deductionsPerSec) {
	total += rate;
	cumulative.push(total);
}

const pickCustomer = (): string => {
	const target = Math.random() * total;
	let low = 0;
	let high = cumulative.length - 1;
	while (low < high) {
		const mid = (low + high) >> 1;
		if ((cumulative[mid] as number) < target) low = mid + 1;
		else high = mid;
	}
	return plan.customerIds[low] as string;
};

const counts = new Map<number, { hot: StepCounts; others: StepCounts }>();
const countsOf = (step: number) => {
	const held = counts.get(step);
	if (held) return held;
	const fresh = { hot: emptyCounts(), others: emptyCounts() };
	counts.set(step, fresh);
	return fresh;
};

const headers = {
	"content-type": "application/json",
	authorization: `Bearer ${config.tenant.secretKey}`,
	"x-atom-token": config.tenant.token,
	"x-api-version": LATEST_VERSION,
};

let keysMinted = 0;
/** Unique across the driver's processes and runs, as the shadow's `atom_shadow_<request id>`. */
const mintKey = () => `rig_${process.pid}_${Date.now()}_${keysMinted++}`;

const send = async ({
	customerId,
	deducts,
	step,
	hot,
}: {
	customerId: string;
	deducts: boolean;
	step: number;
	hot: boolean;
}) => {
	const into = step < 0 ? null : countsOf(step)[hot ? "hot" : "others"];
	if (into) into.sent++;
	const url =
		plan.replicaUrls[Math.floor(Math.random() * plan.replicaUrls.length)];
	const asTrack = deducts && config.deductionRoute === "track";
	const key =
		deducts && Math.random() * 100 < config.keyedPercent ? mintKey() : null;
	const body = asTrack
		? {
				customer_id: customerId,
				feature_id: "messages",
				value: 1,
				...(key && { idempotency_key: key }),
			}
		: {
				customer_id: customerId,
				feature_id: "messages",
				required_balance: 1,
				...(deducts && { send_event: true }),
			};
	const sentAt = performance.now();
	try {
		const reply = await fetch(
			`${url}/v1/${asTrack ? "track" : "balances.check"}`,
			{
				method: "POST",
				headers: key ? { ...headers, "idempotency-key": key } : headers,
				body: JSON.stringify(body),
				keepalive: config.keepAlive,
				signal: AbortSignal.timeout(config.requestTimeoutMs),
			},
		);
		await reply.arrayBuffer();
		if (!into) return;
		into.histogram[bucketOf(performance.now() - sentAt)]++;
		const forwarded = reply.headers.get("x-atom-forwarded");
		if (forwarded) {
			into.forwarded++;
			into.forwardReasons[forwarded] =
				(into.forwardReasons[forwarded] ?? 0) + 1;
		} else if (reply.ok) into.answered++;
		else if (reply.status === 503) into.shed++;
		else into.failed++;
	} catch {
		if (into) into.failed++;
	}
};

const flush = (step: number) => {
	const finished = counts.get(step);
	if (!finished) return;
	console.log(JSON.stringify({ type: "step", step, ...finished }));
	counts.delete(step);
};

/** Fractional requests owed per stream, so every rate is met on average whatever the tick. */
const owed = {
	backgroundDeductions: 0,
	backgroundReads: 0,
	hotDeductions: 0,
	hotReads: 0,
};
const share = 1 / plan.processCount;
await Bun.sleep(Math.max(0, plan.startAt - Date.now()));
const startedAt = performance.now();
let last = startedAt;
let lastStep = -1;
while (true) {
	const now = performance.now();
	const elapsedS = (now - startedAt) / 1000;
	if (elapsedS >= timeline.endsAtS) break;
	const dtS = (now - last) / 1000;
	last = now;
	const step = timeline.stepAt(elapsedS);
	if (step !== lastStep) {
		const finished = lastStep;
		setTimeout(() => flush(finished), config.requestTimeoutMs + 500);
		lastStep = step;
	}
	const backgroundRate = total * timeline.backgroundShareAt(elapsedS);
	const hotRate =
		step < 0 ? 0 : (timeline.steps[step]?.hotDeductionsPerSec ?? 0) * share;
	owed.backgroundDeductions += backgroundRate * dtS;
	owed.backgroundReads +=
		backgroundRate * config.background.readChecksPerDeduction * dtS;
	owed.hotDeductions += hotRate * dtS;
	owed.hotReads += hotRate * config.hot.readChecksPerDeduction * dtS;
	for (; owed.backgroundDeductions >= 1; owed.backgroundDeductions--)
		void send({ customerId: pickCustomer(), deducts: true, step, hot: false });
	for (; owed.backgroundReads >= 1; owed.backgroundReads--)
		void send({ customerId: pickCustomer(), deducts: false, step, hot: false });
	for (; owed.hotDeductions >= 1; owed.hotDeductions--)
		void send({
			customerId: config.customers.hotCustomerId,
			deducts: true,
			step,
			hot: true,
		});
	for (; owed.hotReads >= 1; owed.hotReads--)
		void send({
			customerId: config.customers.hotCustomerId,
			deducts: false,
			step,
			hot: true,
		});
	await Bun.sleep(2);
}
await Bun.sleep(config.requestTimeoutMs + 500);
flush(lastStep);
console.log(JSON.stringify({ type: "done" }));
process.exit(0);
