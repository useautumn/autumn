import type {
	BalanceWorkerClient,
	CheckLeaseCounters,
} from "@autumn/balance-worker-client";
import { logger } from "@/external/logtail/logtailUtils.js";

const CHECK_LEASE_STATS_INTERVAL_MS = 10_000;

let statsInterval: ReturnType<typeof setInterval> | null = null;

const deltaOf = ({
	current,
	previous,
}: {
	current: CheckLeaseCounters;
	previous: CheckLeaseCounters;
}) => ({
	leaseHit: current.leaseHit - previous.leaseHit,
	leaseMiss: current.leaseMiss - previous.leaseMiss,
	leaseIssued: current.leaseIssued - previous.leaseIssued,
	leaseBypassDenied: current.leaseBypassDenied - previous.leaseBypassDenied,
	leaseWithheld: current.leaseWithheld - previous.leaseWithheld,
	leaseEvicted: current.leaseEvicted - previous.leaseEvicted,
});

/** One `balance_worker_check_leases` line per interval with traffic: counts since the last line, so Axiom sums them. */
export const startCheckLeaseStats = ({
	client,
}: {
	client: BalanceWorkerClient;
}): void => {
	if (statsInterval) return;
	let previous = client.readCheckLeaseCounters?.();
	if (!previous) return;
	statsInterval = setInterval(() => {
		const current = client.readCheckLeaseCounters?.();
		if (!current || !previous) return;
		const delta = deltaOf({ current, previous });
		previous = current;
		const checks = delta.leaseHit + delta.leaseMiss;
		if (checks === 0) return;
		logger.info("balance_worker_check_leases", {
			type: "balance_worker_check_leases",
			pid: process.pid,
			intervalMs: CHECK_LEASE_STATS_INTERVAL_MS,
			...delta,
			leaseHitShare: delta.leaseHit / checks,
			size: current.size,
		});
	}, CHECK_LEASE_STATS_INTERVAL_MS);
};

export const stopCheckLeaseStats = (): void => {
	if (!statsInterval) return;
	clearInterval(statsInterval);
	statsInterval = null;
};
