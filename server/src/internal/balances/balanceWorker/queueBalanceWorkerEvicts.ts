import type { EvictCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { generateId } from "@/utils/genUtils.js";

export type EvictableCustomer = {
	orgId: string;
	env: string;
	customerId: string;
};

const uniqueCustomers = ({
	customers,
}: {
	customers: EvictableCustomer[];
}): EvictableCustomer[] => {
	const byKey = new Map<string, EvictableCustomer>();
	for (const customer of customers) {
		if (!customer.customerId) continue;
		byKey.set(
			`${customer.orgId}:${customer.env}:${customer.customerId}`,
			customer,
		);
	}
	return [...byKey.values()];
};

/**
 * A batch writer changed many customers' rows in Postgres: each owning worker drops its copy, in log order.
 * Best effort: the client bounds the append; a failure is logged, since the rows stay stale in memory until the next evict.
 */
export async function queueBalanceWorkerEvicts({
	customers,
	client = getBalanceWorkerClient(),
}: {
	customers: EvictableCustomer[];
	client?: Pick<BalanceWorkerClient, "queue">;
}): Promise<void> {
	const evictable = uniqueCustomers({ customers });
	if (evictable.length === 0) return;
	const requestId = generateId("evict");
	const occurredAt = Date.now();
	const commands: EvictCommand[] = evictable.map(
		({ orgId, env, customerId }) => ({
			schemaVersion: 1,
			type: "evict",
			requestId,
			identity: { orgId, env, customerId, entityId: null },
			occurredAt,
		}),
	);
	try {
		await client.queue.evict({ commands });
	} catch (error) {
		logger.error(
			{
				error,
				type: "balance_worker_evict_queue_failed",
				data: { requestId, customerCount: commands.length },
			},
			"Could not queue balance worker evicts; worker rows may be stale",
		);
	}
}
