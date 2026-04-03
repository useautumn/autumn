import type { Feature, FullCustomer } from "@autumn/shared";
import { fullCustomerToCustomerEntitlements } from "@autumn/shared";
import type { MutationLogItem } from "../types/mutationLogItem.js";

/** Maps customer entitlement and rollover mutation targets to their features (deduped by feature id). */
export const mutationLogsToFeatures = ({
	fullCustomer,
	mutationLogs,
}: {
	fullCustomer: FullCustomer;
	mutationLogs: MutationLogItem[];
}): Feature[] => {
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
	});

	const customerEntitlementIdToFeature = new Map<string, Feature>();
	const rolloverIdToFeature = new Map<string, Feature>();

	for (const customerEntitlement of customerEntitlements) {
		const feature = customerEntitlement.entitlement.feature;
		customerEntitlementIdToFeature.set(customerEntitlement.id, feature);
		for (const rollover of customerEntitlement.rollovers ?? []) {
			rolloverIdToFeature.set(rollover.id, feature);
		}
	}

	const featuresById = new Map<string, Feature>();

	for (const log of mutationLogs) {
		if (
			log.target_type === "customer_entitlement" &&
			log.customer_entitlement_id
		) {
			const resolved = customerEntitlementIdToFeature.get(
				log.customer_entitlement_id,
			);
			if (resolved) featuresById.set(resolved.id, resolved);
		} else if (log.target_type === "rollover" && log.rollover_id) {
			const resolved = rolloverIdToFeature.get(log.rollover_id);
			if (resolved) featuresById.set(resolved.id, resolved);
		}
	}

	return [...featuresById.values()];
};
