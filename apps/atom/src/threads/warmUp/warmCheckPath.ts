import { LATEST_VERSION } from "@autumn/shared";
import { checkCallToRequest } from "../../lib/contracts/checkContract.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";

/**
 * One check answered from a stored subject before the thread reports ready: a thread's first check pays ~10 ms of
 * first-run cost in the engine and renderer, and this way no caller pays it. A thread holding nothing skips it.
 */
export const warmCheckPath = async ({
	folders,
}: {
	folders: ReplicaFolders;
}): Promise<void> => {
	for (const { slots } of folders.all())
		for (const store of slots.ownedStores()) {
			const [first] = store.listAppliedAfter({
				after: null,
				cursor: null,
				limit: 1,
			});
			const feature = first && Object.values(first.subject.catalog.features)[0];
			if (!first || !feature) continue;
			const { customerId, entityId } = first.subject.state.identity;
			// Read through the route's own contract, so its schemas are warmed too.
			const request = checkCallToRequest({
				body: {
					customer_id: customerId,
					feature_id: feature.id,
					...(entityId && { entity_id: entityId }),
				},
				query: {},
				apiVersionHeader: LATEST_VERSION,
				requestId: "atom_warm_up",
				occurredAt: Date.now(),
			});
			await slots
				.processorFor({ customerId })
				.check({ request })
				.catch(() => {});
			return;
		}
};
