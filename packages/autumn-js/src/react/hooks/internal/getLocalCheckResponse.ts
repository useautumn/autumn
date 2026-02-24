import type { CheckResponse, Customer } from "@useautumn/sdk";
import type { ClientCheckParams } from "../../../types/params";
import { balanceToAllowed } from "./check/balanceToAllowed";
import { customerToFeatures } from "./check/customerToFeatures";
import { findCreditSystemsByFeature } from "./check/findCreditSystemsByFeature";
import { getCreditCost } from "./check/getCreditCost";

type CustomerBalance = Customer["balances"][string];
type CustomerFeature = NonNullable<CustomerBalance["feature"]>;

const getFeatureToUse = ({
	featureId,
	features,
	feature,
	customer,
	requiredBalance,
}: {
	featureId: string;
	features: CustomerFeature[];
	feature: CustomerFeature;
	customer: Customer;
	requiredBalance: number;
}) => {
	const creditSystems = findCreditSystemsByFeature({
		featureId,
		features,
	});

	if (creditSystems.length === 0) return feature;

	const mainBalance = customer.balances[feature.id];
	if (
		mainBalance &&
		balanceToAllowed({
			balance: mainBalance,
			feature,
			requiredBalance,
		})
	) {
		return feature;
	}

	for (const creditSystem of creditSystems) {
		const creditBalance = customer.balances[creditSystem.id];
		if (!creditBalance) continue;

		const creditRequiredBalance = getCreditCost({
			featureId: feature.id,
			creditSystem,
			amount: requiredBalance,
		});

		if (
			balanceToAllowed({
				balance: creditBalance,
				feature: creditSystem,
				requiredBalance: creditRequiredBalance,
			})
		) {
			return creditSystem;
		}
	}

	return creditSystems[0];
};

const getFeatureCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer;
	params: ClientCheckParams;
}): CheckResponse => {
	const { featureId, requiredBalance = 1 } = params;

	const features = customerToFeatures({ customer });
	const feature = features.find((item) => item.id === featureId);
	if (!feature) {
		throw new Error(`Feature ${featureId} not found`);
	}

	const featureToUse = getFeatureToUse({
		featureId,
		features,
		feature,
		customer,
		requiredBalance,
	});

	const balanceToUse = customer.balances[featureToUse.id];
	if (!balanceToUse) {
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance,
			balance: null,
		};
	}

	const requiredBalanceToUse =
		featureToUse.type === "credit_system" && featureToUse.id !== feature.id
			? getCreditCost({
					featureId: feature.id,
					creditSystem: featureToUse,
					amount: requiredBalance,
				})
			: requiredBalance;

	const allowed = balanceToAllowed({
		balance: balanceToUse,
		feature: featureToUse,
		requiredBalance: requiredBalanceToUse,
	});

	return {
		allowed,
		customerId: customer.id ?? "",
		entityId: params.entityId ?? null,
		requiredBalance: requiredBalanceToUse,
		balance: balanceToUse as CheckResponse["balance"],
	};
};

export const getLocalCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer | null;
	params: ClientCheckParams;
}): CheckResponse => {
	if (!customer) {
		return {
			allowed: false,
			customerId: "",
			entityId: params.entityId ?? null,
			requiredBalance: params.requiredBalance ?? 1,
			balance: null,
		};
	}

	if (!params.featureId) {
		throw new Error("check() requires featureId");
	}

	return getFeatureCheckResponse({ customer, params });
};
