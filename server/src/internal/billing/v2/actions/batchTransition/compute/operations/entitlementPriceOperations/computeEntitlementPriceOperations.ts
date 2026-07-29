import {
	type EntitlementPrice,
	type EntitlementWithFeature,
	entsAreSame,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
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
import { computeCustomerEntitlementPatch } from "./computeCustomerEntitlementPatch";

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
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	transition: EntitlementPriceTransition;
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
	if (fromEntitlementIds.length === 0) return undefined;

	return {
		type: "replace",
		fromEntitlementIds,
		toEntitlementId: toEntitlement.id,
		fromEntitlementPrice,
		toEntitlementPrice,
		customerEntitlementPatch: computeCustomerEntitlementPatch({
			fromEntitlement,
			toEntitlement,
		}),
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

	return {
		type: "add",
		entitlementPrice,
		existingEntitlementIds: [...new Set(existingEntitlementIds)],
		customerEntitlement: initCustomerEntitlementFields({
			initContext,
			initOptions,
			entitlement: entitlementPrice.entitlement,
		}),
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

const hasPrice = (entitlementPrice: EntitlementPrice) =>
	Boolean(entitlementPrice.price);

export const computeEntitlementPriceOperations = ({
	candidateOutgoingEntitlements,
	entitlementPriceTransitions,
	customerEntitlementInitContext,
	customerEntitlementInitOptions,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	entitlementPriceTransitions: ComputedEntitlementPriceTransitions;
	customerEntitlementInitContext: InitCustomerEntitlementContext;
	customerEntitlementInitOptions: InitFullCustomerProductOptions;
}): {
	operations: EntitlementPriceOperation[];
	unhandled: ComputedEntitlementPriceTransitions;
} => {
	const operations: EntitlementPriceOperation[] = [];
	const unhandled: ComputedEntitlementPriceTransitions = {
		transitions: [],
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

		const operation = computeReplaceOperation({
			candidateOutgoingEntitlements,
			transition,
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
