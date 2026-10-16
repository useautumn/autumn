import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { getBenchContext } from "../utils/benchContext.js";
import { sendCheck } from "./trackLoad.js";

const ROUTING_FAILURES = new Set([
	"ROUTE_STILL_STALE",
	"NO_OWNER",
	"OWNERSHIP_UNAVAILABLE",
	"TRANSPORT",
]);
const PARTITIONS = Number(process.env.BALANCE_WORKER_PARTITION_COUNT ?? 64);

const { ctx, org } = await getBenchContext({ sharedDb: true });
const client = getBalanceWorkerClient();
const probes = new Map<number, string>();
for (let index = 0; probes.size < PARTITIONS && index < 100_000; index++) {
	const customerId = `route-gate-${index}`;
	const partition = meteringIdentityToPartition({
		identity: { orgId: org.id, env: ctx.env, customerId, entityId: null },
		partitionCount: PARTITIONS,
	});
	if (!probes.has(partition)) probes.set(partition, customerId);
}
const outcomes = await Promise.all(
	[...probes].map(async ([partition, customerId]) => {
		try {
			await sendCheck({ ctx, client, customerId });
			return { partition, outcome: "ok" };
		} catch (cause) {
			const code =
				cause instanceof BalanceWorkerClientError
					? cause.code
					: String((cause as Error).name);
			return { partition, outcome: code };
		}
	}),
);
const unroutable = outcomes.filter(({ outcome }) =>
	ROUTING_FAILURES.has(outcome),
);
const counts: Record<string, number> = {};
for (const { outcome } of outcomes)
	counts[outcome] = (counts[outcome] ?? 0) + 1;
console.log(
	`ROUTE_GATE ${PARTITIONS - unroutable.length}/${PARTITIONS} routable ${JSON.stringify(counts)} unroutable ${JSON.stringify(unroutable.map(({ partition }) => partition))}`,
);
process.exit(unroutable.length === 0 ? 0 : 3);
