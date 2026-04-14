import {
	type ApiBalanceV1,
	type Feature,
	FeatureType,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	getRelevantFeatures,
	InternalError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiSubject } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

type TrackBalanceResponse = {
	balance: ApiBalanceV1 | null;
	balances?: Record<string, ApiBalanceV1>;
};

const computeActualDeductions = ({
	fullSubject,
	updates,
}: {
	fullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
}): Record<string, number> => {
	const actualDeductions: Record<string, number> = {};
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});

	for (const customerEntitlementId of Object.keys(updates)) {
		const update = updates[customerEntitlementId];
		const customerEntitlement = customerEntitlements.find(
			(candidate) => candidate.id === customerEntitlementId,
		);

		if (!customerEntitlement) {
			throw new InternalError({
				message: `Customer entitlement ${customerEntitlementId} not found in full subject`,
				code: "full_subject_customer_entitlement_not_found",
			});
		}

		const featureId = customerEntitlement.entitlement.feature.id;
		const currentDeduction = actualDeductions[featureId] || 0;
		actualDeductions[featureId] = new Decimal(currentDeduction)
			.plus(update.deducted)
			.toNumber();
	}

	return actualDeductions;
};

const findUnlimitedFeature = ({
	ctx,
	fullSubject,
	featureId,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureId: string;
}): Feature | undefined => {
	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId,
	});

	for (const feature of relevantFeatures) {
		const customerEntitlements = fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [feature.id],
		});

		if (
			customerEntitlements.some(
				(customerEntitlement) => customerEntitlement.unlimited,
			)
		) {
			return feature;
		}
	}

	return undefined;
};

const getFeatureToUseForBalance = ({
	ctx,
	fullSubject,
	featureDeduction,
	actualDeductions,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeduction: FeatureDeduction;
	actualDeductions: Record<string, number>;
}): string => {
	const unlimitedFeature = findUnlimitedFeature({
		ctx,
		fullSubject,
		featureId: featureDeduction.feature.id,
	});

	if (unlimitedFeature) {
		return unlimitedFeature.id;
	}

	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId: featureDeduction.feature.id,
	}).sort((left, right) => {
		if (
			left.type === FeatureType.CreditSystem &&
			right.type !== FeatureType.CreditSystem
		) {
			return 1;
		}

		if (
			left.type !== FeatureType.CreditSystem &&
			right.type === FeatureType.CreditSystem
		) {
			return -1;
		}

		return 0;
	});
	const featureWithDeduction = relevantFeatures.find(
		(feature) => (actualDeductions[feature.id] ?? 0) > 0,
	);

	if (featureWithDeduction) {
		return featureWithDeduction.id;
	}

	const creditSystem = relevantFeatures.find(
		(feature) => feature.id !== featureDeduction.feature.id,
	);

	return creditSystem?.id ?? featureDeduction.feature.id;
};

export const deductionToTrackResponseV2 = async ({
	ctx,
	fullSubject,
	featureDeductions,
	updates,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
	updates: Record<string, DeductionUpdate>;
}): Promise<TrackBalanceResponse> => {
	const actualDeductions = computeActualDeductions({
		fullSubject,
		updates,
	});
	const apiSubject = await getApiSubject({
		ctx,
		fullSubject,
		includeAggregations: true,
	});
	const finalBalances: Record<string, ApiBalanceV1> = {};

	for (const featureDeduction of featureDeductions) {
		const featureToUse = getFeatureToUseForBalance({
			ctx,
			fullSubject,
			featureDeduction,
			actualDeductions,
		});
		const balance = apiSubject.balances?.[featureToUse];
		if (balance) {
			finalBalances[featureToUse] = balance;
		}
	}

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
