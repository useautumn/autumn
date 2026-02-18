import type { BalancesCheckResponse, Customer } from "@useautumn/sdk";
import {
	type ApiBalanceInput,
	apiBalanceToAllowed,
} from "../../../../../../shared/api/customers/cusFeatures/utils/convert/apiBalanceToAllowed";
import type { ClientCheckParams } from "../../../types/params";
import { toSnakeCase } from "../../../utils/toSnakeCase";

type CustomerBalance = Customer["balances"][string];

const resolveRequiredBalance = ({
	requiredBalance,
	requiredQuantity,
}: {
	requiredBalance?: number;
	requiredQuantity?: number;
}) => {
	return requiredBalance ?? requiredQuantity ?? 1;
};

const isBalanceAllowed = ({
	balance,
	requiredBalance,
}: {
	balance: CustomerBalance;
	requiredBalance: number;
}) => {
	const snakeCaseBalance = toSnakeCase({
		obj: balance,
	}) as unknown as ApiBalanceInput;

	const featureForCheck = {
		type: balance.feature?.type ?? "metered",
	} as Parameters<typeof apiBalanceToAllowed>[0]["feature"];

	return apiBalanceToAllowed({
		apiBalance: snakeCaseBalance,
		feature: featureForCheck,
		requiredBalance,
	});
};

const getCreditBalanceRequired = ({
	creditBalance,
	featureId,
	requiredBalance,
}: {
	creditBalance: CustomerBalance;
	featureId: string;
	requiredBalance: number;
}) => {
	const creditCost =
		creditBalance.feature?.creditSchema?.find(
			(schema) => schema.meteredFeatureId === featureId,
		)?.creditCost ?? 1;

	return requiredBalance * creditCost;
};

const getFeatureCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer;
	params: ClientCheckParams;
}): BalancesCheckResponse => {
	const featureId = params.featureId;
	if (!featureId) {
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance: resolveRequiredBalance({
				requiredBalance: params.requiredBalance,
				requiredQuantity: params.requiredQuantity,
			}),
			balance: null,
		};
	}

	const requiredBalance = resolveRequiredBalance({
		requiredBalance: params.requiredBalance,
		requiredQuantity: params.requiredQuantity,
	});

	const mainBalance = customer.balances[featureId];

	const creditBalances = Object.values(customer.balances).filter((balance) =>
		balance.feature?.creditSchema?.some(
			(schema) => schema.meteredFeatureId === featureId,
		),
	);

	if (
		mainBalance &&
		isBalanceAllowed({ balance: mainBalance, requiredBalance })
	) {
		return {
			allowed: true,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance,
			balance: mainBalance as BalancesCheckResponse["balance"],
		};
	}

	for (const creditBalance of creditBalances) {
		const creditRequiredBalance = getCreditBalanceRequired({
			creditBalance,
			featureId,
			requiredBalance,
		});

		if (
			isBalanceAllowed({
				balance: creditBalance,
				requiredBalance: creditRequiredBalance,
			})
		) {
			return {
				allowed: true,
				customerId: customer.id ?? "",
				entityId: params.entityId ?? null,
				requiredBalance: creditRequiredBalance,
				balance: creditBalance as BalancesCheckResponse["balance"],
			};
		}
	}

	if (mainBalance) {
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance,
			balance: mainBalance as BalancesCheckResponse["balance"],
		};
	}

	if (creditBalances.length > 0) {
		const firstCreditBalance = creditBalances[0];
		return {
			allowed: false,
			customerId: customer.id ?? "",
			entityId: params.entityId ?? null,
			requiredBalance: getCreditBalanceRequired({
				creditBalance: firstCreditBalance,
				featureId,
				requiredBalance,
			}),
			balance: firstCreditBalance as BalancesCheckResponse["balance"],
		};
	}

	return {
		allowed: false,
		customerId: customer.id ?? "",
		entityId: params.entityId ?? null,
		requiredBalance,
		balance: null,
	};
};

export const getLocalCheckResponse = ({
	customer,
	params,
}: {
	customer: Customer | null;
	params: ClientCheckParams;
}): BalancesCheckResponse => {
	if (!customer) {
		return {
			allowed: false,
			customerId: "",
			entityId: params.entityId ?? null,
			requiredBalance: resolveRequiredBalance({
				requiredBalance: params.requiredBalance,
				requiredQuantity: params.requiredQuantity,
			}),
			balance: null,
		};
	}

	if (!params.featureId) {
		throw new Error("check() requires featureId");
	}

	return getFeatureCheckResponse({ customer, params });
};
