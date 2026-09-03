import {
	type CarryOverUsages,
	EntInterval,
	type EntitlementPrice,
	type EntitlementWithFeature,
	entsAreSame,
	entsHaveSamePooledIdentity,
	entToPooledBalanceIdentity,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
	isBooleanEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { initCustomerEntitlementFields } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementFields";
import type {
	AddEntitlementPriceOperation,
	EntitlementPriceOperation,
	RemoveEntitlementPriceOperation,
	ReplaceEntitlementPriceOperation,
} from "../../../types/entitlementPriceOperationTypes";
import type {
	ComputedEntitlementPriceTransitions,
	EntitlementPriceTransition,
} from "../../transitions/computeEntitlementPriceTransitions";
import {
	computeCustomerEntitlementInitialState,
	computeCustomerEntitlementPatch,
	shouldCarryOverUsage,
} from "./computeCustomerEntitlementPatch";

const findCandidateEntitlementIds = ({
	candidateOutgoingEntitlements,
	entitlement,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	entitlement: EntitlementWithFeature;
}): string[] => {
	const entitlementIds: string[] = [];
	for (const candidateEntitlement of candidateOutgoingEntitlements) {
		if (
			candidateEntitlement.id === entitlement.id ||
			entsAreSame(candidateEntitlement, entitlement)
		) {
			entitlementIds.push(candidateEntitlement.id);
		}
	}
	return entitlementIds;
};

const computeReplaceOperation = ({
	candidateOutgoingEntitlements,
	transition,
	carryOverUsages,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	transition: EntitlementPriceTransition;
	carryOverUsages?: CarryOverUsages;
}): ReplaceEntitlementPriceOperation | undefined => {
	const { fromEntitlementPrice, toEntitlementPrice } = transition;
	const fromEntitlement = fromEntitlementPrice.entitlement;
	const toEntitlement = toEntitlementPrice.entitlement;
	const definitionsAreSame = entsAreSame(fromEntitlement, toEntitlement);
	const fromEntitlementIds = findCandidateEntitlementIds({
		candidateOutgoingEntitlements,
		entitlement: fromEntitlement,
	}).filter(
		(entitlementId) =>
			!definitionsAreSame || entitlementId !== toEntitlement.id,
	);
	if (fromEntitlementIds.length === 0) {
		if (!definitionsAreSame) return undefined;
		fromEntitlementIds.push(toEntitlement.id);
	}

	const fromIsPooled = fromEntitlement.pooled === true;
	const toIsPooled = toEntitlement.pooled === true;
	const isPooledReplace = fromIsPooled && toIsPooled;
	const customerEntitlementPatch = computeCustomerEntitlementPatch({
		fromEntitlement,
		toEntitlement,
		carryOverUsages,
	});
	if (!isPooledReplace) {
		return {
			type: "replace",
			fromEntitlementIds,
			toEntitlementId: toEntitlement.id,
			fromEntitlementPrice,
			toEntitlementPrice,
			customerEntitlementPatch,
		};
	}

	const pooledContributionPatch =
		customerEntitlementPatch.balance?.type === "increment"
			? customerEntitlementPatch.balance
			: {
					type: "set" as const,
					amount: computeCustomerEntitlementInitialState({
						entitlement: toEntitlement,
					}).granted,
				};

	return {
		type: "replace",
		fromEntitlementIds,
		toEntitlementId: toEntitlement.id,
		fromEntitlementPrice,
		toEntitlementPrice,
		customerEntitlementPatch: {
			unlimited: customerEntitlementPatch.unlimited,
		},
		pooledContributionPatch,
	};
};

const computeAddOperation = ({
	candidateOutgoingEntitlements,
	entitlementPrice,
	initContext,
	initOptions,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	entitlementPrice: EntitlementPrice;
	initContext: InitCustomerEntitlementContext;
	initOptions: InitFullCustomerProductOptions;
}): AddEntitlementPriceOperation => {
	const existingEntitlementIds = findCandidateEntitlementIds({
		candidateOutgoingEntitlements,
		entitlement: entitlementPrice.entitlement,
	});
	existingEntitlementIds.push(entitlementPrice.entitlement.id);

	const entitlement = entitlementPrice.entitlement;
	const customerEntitlement = initCustomerEntitlementFields({
		initContext,
		initOptions,
		entitlement,
	});
	if (entitlement.pooled !== true) {
		return {
			type: "add",
			entitlementPrice,
			existingEntitlementIds: [...new Set(existingEntitlementIds)],
			customerEntitlement,
		};
	}

	const customerLicenseLinkId = initOptions.customerLicenseLinkId;
	if (!customerLicenseLinkId) {
		throw new Error(
			"Pooled entitlement addition requires a customer license link",
		);
	}

	const initialState = computeCustomerEntitlementInitialState({ entitlement });
	const entIdentity = entToPooledBalanceIdentity({ entitlement });
	const resetMode =
		entIdentity.interval === EntInterval.Lifetime
			? PooledBalanceResetMode.Lifetime
			: PooledBalanceResetMode.Lazy;
	const isLifetimeReset = resetMode === PooledBalanceResetMode.Lifetime;
	return {
		type: "add",
		entitlementPrice,
		existingEntitlementIds: [...new Set(existingEntitlementIds)],
		customerEntitlement: {
			...customerEntitlement,
			balance: 0,
		},
		pooledAdd: {
			contributionAmount: initialState.granted,
			nextResetAt: isLifetimeReset
				? null
				: (customerEntitlement.next_reset_at ?? null),
			featureId: entitlement.feature.id,
			rollover: entitlement.rollover ?? null,
			identity: {
				...entIdentity,
				internalCustomerId: customerEntitlement.internal_customer_id,
				resetCycleAnchor: isLifetimeReset
					? null
					: (customerEntitlement.reset_cycle_anchor ?? null),
				resetMode,
				stripeSubscriptionId: null,
				customerLicenseLinkId,
			},
		},
	};
};

const computeRemoveOperation = ({
	candidateOutgoingEntitlements,
	entitlementPrice,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	entitlementPrice: EntitlementPrice;
}): RemoveEntitlementPriceOperation | undefined => {
	const fromEntitlementIds = findCandidateEntitlementIds({
		candidateOutgoingEntitlements,
		entitlement: entitlementPrice.entitlement,
	});
	if (fromEntitlementIds.length === 0) return undefined;

	return { type: "remove", entitlementPrice, fromEntitlementIds };
};

const computeTransitionOperations = ({
	candidateOutgoingEntitlements,
	transition,
	initContext,
	initOptions,
	carryOverUsages,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	transition: EntitlementPriceTransition;
	initContext: InitCustomerEntitlementContext;
	initOptions: InitFullCustomerProductOptions;
	carryOverUsages?: CarryOverUsages;
}): EntitlementPriceOperation[] => {
	const fromEntitlement = transition.fromEntitlementPrice.entitlement;
	const toEntitlement = transition.toEntitlementPrice.entitlement;
	const fromIsPooled = fromEntitlement.pooled === true;
	const toIsPooled = toEntitlement.pooled === true;
	const isPooledAmountChange =
		fromIsPooled &&
		toIsPooled &&
		entsHaveSamePooledIdentity(fromEntitlement, toEntitlement);

	if (isPooledAmountChange || (!fromIsPooled && !toIsPooled)) {
		const operation = computeReplaceOperation({
			candidateOutgoingEntitlements,
			transition,
			carryOverUsages,
		});
		return operation ? [operation] : [];
	}

	const operations: EntitlementPriceOperation[] = [];
	const remove = computeRemoveOperation({
		candidateOutgoingEntitlements,
		entitlementPrice: transition.fromEntitlementPrice,
	});
	if (remove) operations.push(remove);
	operations.push(
		computeAddOperation({
			candidateOutgoingEntitlements,
			entitlementPrice: transition.toEntitlementPrice,
			initContext,
			initOptions,
		}),
	);
	return operations;
};

const hasPrice = (entitlementPrice: EntitlementPrice) =>
	Boolean(entitlementPrice.price);

export const computeEntitlementPriceOperations = ({
	candidateOutgoingEntitlements,
	entitlementPriceTransitions,
	customerEntitlementInitContext,
	customerEntitlementInitOptions,
	carryOverUsages,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	entitlementPriceTransitions: ComputedEntitlementPriceTransitions;
	customerEntitlementInitContext: InitCustomerEntitlementContext;
	customerEntitlementInitOptions: InitFullCustomerProductOptions;
	carryOverUsages?: CarryOverUsages;
}): {
	operations: EntitlementPriceOperation[];
	unhandled: ComputedEntitlementPriceTransitions;
} => {
	const operations: EntitlementPriceOperation[] = [];
	const unhandled: ComputedEntitlementPriceTransitions = {
		transitions: [],
		retained: [],
		added: [],
		deleted: [],
	};

	for (const transition of entitlementPriceTransitions.transitions) {
		if (
			hasPrice(transition.fromEntitlementPrice) ||
			hasPrice(transition.toEntitlementPrice)
		) {
			unhandled.transitions.push(transition);
			continue;
		}

		operations.push(
			...computeTransitionOperations({
				candidateOutgoingEntitlements,
				transition,
				initContext: customerEntitlementInitContext,
				initOptions: customerEntitlementInitOptions,
				carryOverUsages,
			}),
		);
	}

	for (const transition of entitlementPriceTransitions.retained) {
		if (
			isBooleanEntitlement({
				entitlement: transition.toEntitlementPrice.entitlement,
			})
		) {
			continue;
		}
		if (
			hasPrice(transition.fromEntitlementPrice) ||
			hasPrice(transition.toEntitlementPrice)
		) {
			unhandled.retained.push(transition);
			continue;
		}

		if (
			shouldCarryOverUsage({
				toEntitlement: transition.toEntitlementPrice.entitlement,
				carryOverUsages,
			})
		) {
			continue;
		}

		const operation = computeReplaceOperation({
			candidateOutgoingEntitlements,
			transition,
			carryOverUsages,
		});
		if (operation) operations.push(operation);
	}

	for (const entitlementPrice of entitlementPriceTransitions.added) {
		if (hasPrice(entitlementPrice)) {
			unhandled.added.push(entitlementPrice);
			continue;
		}
		operations.push(
			computeAddOperation({
				candidateOutgoingEntitlements,
				entitlementPrice,
				initContext: customerEntitlementInitContext,
				initOptions: customerEntitlementInitOptions,
			}),
		);
	}

	for (const entitlementPrice of entitlementPriceTransitions.deleted) {
		if (hasPrice(entitlementPrice)) {
			unhandled.deleted.push(entitlementPrice);
			continue;
		}
		const operation = computeRemoveOperation({
			candidateOutgoingEntitlements,
			entitlementPrice,
		});
		if (operation) operations.push(operation);
	}

	return { operations, unhandled };
};
