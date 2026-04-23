import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { MutationLogItem } from "../types/mutationLogItem.js";

const buildZeroDeductionUpdate = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}): DeductionUpdate => ({
	balance: customerEntitlement.balance ?? 0,
	additional_balance: customerEntitlement.additional_balance ?? 0,
	adjustment: customerEntitlement.adjustment ?? 0,
	entities: customerEntitlement.entities ?? {},
	deducted: 0,
});

const getTouchedCustomerEntitlementIds = ({
	updates,
	mutationLogs,
	modifiedCustomerEntitlementIds,
}: {
	updates: Record<string, DeductionUpdate>;
	mutationLogs: MutationLogItem[];
	modifiedCustomerEntitlementIds?: string[];
}): string[] => {
	const touchedCustomerEntitlementIds = new Set(Object.keys(updates));

	for (const customerEntitlementId of modifiedCustomerEntitlementIds ?? []) {
		if (customerEntitlementId) {
			touchedCustomerEntitlementIds.add(customerEntitlementId);
		}
	}

	for (const mutationLog of mutationLogs) {
		if (mutationLog.customer_entitlement_id) {
			touchedCustomerEntitlementIds.add(mutationLog.customer_entitlement_id);
		}
	}

	return [...touchedCustomerEntitlementIds];
};

export const normalizeDeductionSyncStateV2 = ({
	customerEntitlements,
	updates,
	mutationLogs,
	modifiedCustomerEntitlementIds,
	syncUpdates,
	modifiedCusEntIdsByFeatureId,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	updates: Record<string, DeductionUpdate>;
	mutationLogs: MutationLogItem[];
	modifiedCustomerEntitlementIds?: string[];
	syncUpdates: Record<string, DeductionUpdate>;
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
}): {
	syncUpdates: Record<string, DeductionUpdate>;
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
} => {
	const nextSyncUpdates = { ...syncUpdates };
	const customerEntitlementById = new Map(
		customerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	const modifiedCusEntIdSetsByFeatureId = new Map<string, Set<string>>();

	for (const [featureId, customerEntitlementIds] of Object.entries(
		modifiedCusEntIdsByFeatureId,
	)) {
		modifiedCusEntIdSetsByFeatureId.set(
			featureId,
			new Set(customerEntitlementIds),
		);
	}

	const touchedCustomerEntitlementIds = getTouchedCustomerEntitlementIds({
		updates,
		mutationLogs,
		modifiedCustomerEntitlementIds,
	});

	for (const customerEntitlementId of touchedCustomerEntitlementIds) {
		const customerEntitlement = customerEntitlementById.get(
			customerEntitlementId,
		);
		if (!customerEntitlement) continue;

		if (updates[customerEntitlementId]) {
			nextSyncUpdates[customerEntitlementId] = updates[customerEntitlementId];
		} else if (!nextSyncUpdates[customerEntitlementId]) {
			nextSyncUpdates[customerEntitlementId] = buildZeroDeductionUpdate({
				customerEntitlement,
			});
		}

		const featureId = customerEntitlement.entitlement.feature.id;
		if (!modifiedCusEntIdSetsByFeatureId.has(featureId)) {
			modifiedCusEntIdSetsByFeatureId.set(featureId, new Set());
		}
		modifiedCusEntIdSetsByFeatureId.get(featureId)?.add(customerEntitlementId);
	}

	return {
		syncUpdates: nextSyncUpdates,
		modifiedCusEntIdsByFeatureId: Object.fromEntries(
			[...modifiedCusEntIdSetsByFeatureId.entries()].map(
				([featureId, customerEntitlementIds]) => [
					featureId,
					[...customerEntitlementIds],
				],
			),
		),
	};
};
