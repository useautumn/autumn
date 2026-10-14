/**
 * One of the roll driver's load processes: its slice of the customers at a flat rate, each request to one of the
 * replicas the driver currently routes to (as the ALB would), counted per second and per owner class (whose customer it
 * is, by the Atom's own ring). Routing changes arrive on stdin; one JSON line per finished second goes to stdout, then
 * the keys of every deduction and how it ended. Spawned by rig:roll.
 */
import { LATEST_VERSION } from "@autumn/shared";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import { rigConfig } from "./rigConfig.js";
import {
	bucketOf,
	emptyRollCounts,
	emptyRollLockCounts,
	type OwnerClass,
	type RollCounts,
	type RollLoadPlan,
	type RollRouting,
} from "./rigShared.js";

const plan: RollLoadPlan = await Bun.file(process.argv[2] as string).json();
const config = rigConfig;
const ring = createReplicaRing({
	ctx: {
		resolver: { peers: async () => [plan.members.a, plan.members.b] },
		own: () => [plan.members.a],
	},
});
const ownerClassOf = new Map<string, OwnerClass>();
for (const customerId of plan.customerIds)
	ownerClassOf.set(
		customerId,
		(await ring.ownerOf({ customerId })) === plan.members.a ? "a" : "b",
	);

let routed: OwnerClass[] = ["a", "b"];
let stopped = false;
const seconds = new Map<number, Record<OwnerClass, RollCounts>>();
const keys = { allowed: [] as string[], ambiguous: [] as string[] };
let flushedThrough = -1;

const countsOf = (second: number, owner: OwnerClass): RollCounts => {
	const held = seconds.get(second) ?? {
		a: emptyRollCounts(),
		b: emptyRollCounts(),
	};
	seconds.set(second, held);
	return held[owner];
};

const add = (record: Record<string, number>, key: string) => {
	record[key] = (record[key] ?? 0) + 1;
};

const headers = {
	"content-type": "application/json",
	authorization: `Bearer ${config.tenant.secretKey}`,
	"x-atom-token": config.tenant.token,
	"x-api-version": LATEST_VERSION,
};

let nextKey = 0;
const locks = emptyRollLockCounts();
const pendingFinalizes = new Set<Promise<unknown>>();

/** Releases the lock on whichever replica is routed to then: after a move, the new owner must find the handed row. */
const finalize = async ({
	customerId,
	lockId,
}: {
	customerId: string;
	lockId: string;
}) => {
	const to = routed[Math.floor(Math.random() * routed.length)] ?? "a";
	try {
		const reply = await fetch(`${plan.replicaUrls[to]}/v1/balances.finalize`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				customer_id: customerId,
				lock_id: lockId,
				action: "release",
			}),
			keepalive: config.keepAlive,
			signal: AbortSignal.timeout(config.requestTimeoutMs),
		});
		const body = (await reply.json().catch(() => null)) as {
			code?: string;
		} | null;
		const forwarded = reply.headers.get("x-atom-forwarded");
		if (forwarded) add(locks.finalizeForwarded, forwarded);
		else if (reply.ok) locks.finalized++;
		else
			add(
				locks.finalizeFailed,
				body?.code ? `${reply.status} ${body.code}` : String(reply.status),
			);
	} catch (error) {
		add(
			locks.finalizeFailed,
			error instanceof Error && error.name === "TimeoutError"
				? "timeout"
				: "error",
		);
	}
};

const finalizeLater = ({
	customerId,
	lockId,
}: {
	customerId: string;
	lockId: string;
}) => {
	const settled = Bun.sleep(plan.lockFinalizeAfterMs).then(() =>
		finalize({ customerId, lockId }),
	);
	pendingFinalizes.add(settled);
	void settled.finally(() => pendingFinalizes.delete(settled));
};

const send = async ({
	customerId,
	deducts,
	lock = false,
}: {
	customerId: string;
	deducts: boolean;
	/** A deducting check that also holds its unit under a lock id, released `lockFinalizeAfterMs` later. */
	lock?: boolean;
}) => {
	const sentAt = Date.now();
	const second = Math.floor((sentAt - plan.startAt) / 1000);
	const into = countsOf(second, ownerClassOf.get(customerId) ?? "a");
	into.sent++;
	const to = routed[Math.floor(Math.random() * routed.length)] ?? "a";
	add(into.sentTo, to);
	const key = deducts ? `${plan.index}-${nextKey++}` : null;
	const lockId = lock && key ? `lock-${key}` : null;
	const startedAt = performance.now();
	try {
		const reply = await fetch(`${plan.replicaUrls[to]}/v1/balances.check`, {
			method: "POST",
			headers: key ? { ...headers, "idempotency-key": key } : headers,
			body: JSON.stringify({
				customer_id: customerId,
				feature_id: "messages",
				required_balance: 1,
				...(deducts && { send_event: true }),
				...(lockId && { lock: { enabled: true, lock_id: lockId } }),
			}),
			keepalive: config.keepAlive,
			signal: AbortSignal.timeout(config.requestTimeoutMs),
		});
		const body = (await reply.json().catch(() => null)) as {
			allowed?: boolean;
			code?: string;
		} | null;
		into.histogram[bucketOf(performance.now() - startedAt)]++;
		const proxied = reply.headers.get("x-atom-proxied");
		if (proxied) add(into.proxied, proxied);
		const forwarded = reply.headers.get("x-atom-forwarded");
		if (forwarded) {
			into.forwarded++;
			add(into.forwardReasons, forwarded);
		} else if (reply.ok) into.answered++;
		else
			add(
				into.failedStatus,
				body?.code ? `${reply.status} ${body.code}` : String(reply.status),
			);
		if (!key) return;
		if (reply.ok && body?.allowed) {
			into.allowed++;
			keys.allowed.push(key);
			if (lockId) {
				locks.taken++;
				finalizeLater({ customerId, lockId });
			}
		} else if (!reply.ok) keys.ambiguous.push(key);
		if (lockId && !(reply.ok && body?.allowed))
			add(locks.takeFailed, body?.code ?? String(reply.status));
	} catch (error) {
		into.histogram[bucketOf(performance.now() - startedAt)]++;
		add(
			into.failedStatus,
			error instanceof Error && error.name === "TimeoutError"
				? "timeout"
				: "error",
		);
		if (key) keys.ambiguous.push(key);
		if (lockId) add(locks.takeFailed, "error");
	}
};

/** A second is written once every request sent in it has ended, one way or another. */
const flushSettled = () => {
	const settledThrough =
		Math.floor((Date.now() - plan.startAt - config.requestTimeoutMs) / 1000) -
		1;
	for (let second = flushedThrough + 1; second <= settledThrough; second++) {
		const held = seconds.get(second);
		if (held) console.log(JSON.stringify({ type: "second", second, ...held }));
		seconds.delete(second);
		flushedThrough = second;
	}
};

const readRouting = async () => {
	const decoder = new TextDecoder();
	let buffered = "";
	for await (const chunk of Bun.stdin.stream()) {
		buffered += decoder.decode(chunk);
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		for (const text of lines) {
			if (!text.trim()) continue;
			const line = JSON.parse(text) as RollRouting;
			if (line.type === "route") routed = line.to;
			else stopped = true;
		}
	}
};
void readRouting();

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

const owed = { deductions: 0, reads: 0 };
let deductionsSent = 0;
await Bun.sleep(Math.max(0, plan.startAt - Date.now()));
let last = performance.now();
for (;;) {
	const now = performance.now();
	if (stopped || Date.now() - plan.startAt >= plan.durationS * 1000) break;
	const dtS = (now - last) / 1000;
	last = now;
	owed.deductions += total * dtS;
	owed.reads += total * plan.readChecksPerDeduction * dtS;
	for (; owed.deductions >= 1; owed.deductions--)
		void send({
			customerId: pickCustomer(),
			deducts: true,
			lock: plan.lockEvery > 0 && ++deductionsSent % plan.lockEvery === 0,
		});
	for (; owed.reads >= 1; owed.reads--)
		void send({ customerId: pickCustomer(), deducts: false });
	flushSettled();
	await Bun.sleep(2);
}
await Bun.sleep(config.requestTimeoutMs + 500);
await Promise.all([...pendingFinalizes]);
for (const second of [...seconds.keys()].sort((x, y) => x - y)) {
	const held = seconds.get(second);
	if (held) console.log(JSON.stringify({ type: "second", second, ...held }));
}
console.log(JSON.stringify({ type: "keys", ...keys }));
console.log(JSON.stringify({ type: "locks", locks }));
console.log(JSON.stringify({ type: "done" }));
process.exit(0);
