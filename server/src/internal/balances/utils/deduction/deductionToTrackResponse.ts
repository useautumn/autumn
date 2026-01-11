import type { ApiBalance, Feature, FullCustomer } from "@autumn/shared";
import {
	cusProductsToCusEnts,
	findCustomerEntitlementById,
	getRelevantFeatures,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

type TrackBalanceResponse = {
	balance: ApiBalance | null;
	balances?: Record<string, ApiBalance>;
};

/**
 * Convert updates keyed by cusEntId to actualDeductions keyed by featureId.
 * Looks up each cusEntId in fullCus to determine its feature.
 */
export const computeActualDeductions = ({
	fullCus,
	updates,
}: {
	fullCus: FullCustomer;
	updates: Record<string, DeductionUpdate>;
}): Record<string, number> => {
	const actualDeductions: Record<string, number> = {};

	const customerEntitlements = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
	});

	for (const cusEntId of Object.keys(updates)) {
		const update = updates[cusEntId];

		const cusEnt = findCustomerEntitlementById({
			cusEnts: customerEntitlements,
			id: cusEntId,
			errorOnNotFound: true,
		});

		const featureId = cusEnt.entitlement.feature.id;

		// Accumulate deductions per feature
		const currentDeduction = actualDeductions[featureId] || 0;
		actualDeductions[featureId] = new Decimal(currentDeduction)
			.plus(update.deducted)
			.toNumber();
	}

	return actualDeductions;
};

const findUnlimitedFeature = ({
	ctx,
	fullCustomer,
	featureId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureId: string;
}): Feature | undefined => {
	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId,
	});

	for (const feature of relevantFeatures) {
		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCustomer.customer_products,
			featureIds: [feature.id],
		});

		if (cusEnts.some((cusEnt) => cusEnt.unlimited)) {
			return feature;
		}
	}

	return undefined;
};

/**
 * Determines which feature's balance to return for a given featureDeduction.
 * Prefers credit systems that were actually deducted from, else falls back to the main feature.
 */
const getFeatureToUseForBalance = ({
	ctx,
	fullCustomer,
	featureDeduction,
	actualDeductions,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureDeduction: FeatureDeduction;
	actualDeductions: Record<string, number>;
}): string => {
	const unlimitedFeauture = findUnlimitedFeature({
		ctx,
		fullCustomer,
		featureId: featureDeduction.feature.id,
	});

	if (unlimitedFeauture) {
		return unlimitedFeauture.id;
	}

	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId: featureDeduction.feature.id,
	});

	// Find first feature that had an actual deduction
	const featureWithDeduction = relevantFeatures.find(
		(f) => (actualDeductions[f.id] ?? 0) > 0,
	);

	if (featureWithDeduction) {
		return featureWithDeduction.id;
	}

	// If no deduction occurred, prefer a credit system (if exists), else main feature
	const creditSystem = relevantFeatures.find(
		(f) => f.id !== featureDeduction.feature.id,
	);
	return creditSystem?.id ?? featureDeduction.feature.id;
};

/**
 * Builds the track response balances from deduction updates.
 * Unifies the balance response logic from Redis and Postgres deduction paths.
 */
export const deductionToTrackResponse = async ({
	ctx,
	fullCus,
	featureDeductions,
	updates,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	featureDeductions: FeatureDeduction[];
	updates: Record<string, DeductionUpdate>;
}): Promise<TrackBalanceResponse> => {
	// 1. Compute actual deductions per feature from the raw updates
	const actualDeductions = computeActualDeductions({ fullCus, updates });

	// 2. Get API customer with balances
	const { apiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus,
	});

	// 3. Build balances response
	const finalBalances: Record<string, ApiBalance> = {};

	// Add primary features (always - they were requested to be tracked)
	for (const deduction of featureDeductions) {
		const featureToUse = getFeatureToUseForBalance({
			ctx,
			featureDeduction: deduction,
			fullCustomer: fullCus,
			actualDeductions,
		});

		const balance = apiCustomer.balances[featureToUse];
		if (balance) {
			finalBalances[featureToUse] = balance;
		}
	}

	// 5. Return appropriate response based on number of balances
	if (Object.keys(finalBalances).length === 0) {
		return {
			balance: null,
			balances: undefined,
		};
	}

	if (Object.keys(finalBalances).length === 1) {
		return {
			balance: Object.values(finalBalances)[0],
			balances: undefined,
		};
	}

	return {
		balance: null,
		balances: finalBalances,
	};
};
