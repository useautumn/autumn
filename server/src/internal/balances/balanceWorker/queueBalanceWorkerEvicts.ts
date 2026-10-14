import type { EvictCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { generateId } from "@/utils/genUtils.js";

export type EvictableCustomer = {
	orgId: string;
	env: string;
	customerId: string | null;
	entityId?: string;
};

const uniqueCustomers = ({
	customers,
}: {
	customers: EvictableCustomer[];
}): (EvictableCustomer & { customerId: string })[] => {
	const byKey = new Map<string, EvictableCustomer & { customerId: string }>();
	for (const { customerId, ...customer } of customers) {
		if (!customerId) continue;
		byKey.set(
			`${customer.orgId}:${customer.env}:${customerId}:${customer.entityId ?? ""}`,
			{ ...customer, customerId },
		);
	}
	return [...byKey.values()];
};

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
		({ orgId, env, customerId, entityId = null }) => ({
			schemaVersion: 1,
			type: "evict",
			requestId,
			identity: { orgId, env, customerId, entityId },
			occurredAt,
			refreshSnapshots: false,
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
