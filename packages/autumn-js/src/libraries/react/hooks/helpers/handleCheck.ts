import type { Customer, Entity } from "@useautumn/sdk/models";
import type { AutumnContextParams } from "../../AutumnContext";
import type { CheckParams } from "../../client/autumnTypes";
import type { CheckResponse } from "../../client/clientTypes";

export interface AllowedParams {
	featureId?: string;
	productId?: string;
	requiredBalance?: number;
}

type BalanceLike = {
	unlimited?: boolean;
	overageAllowed?: boolean;
	currentBalance?: number;
	feature?: {
		creditSchema?: Array<{ meteredFeatureId: string; creditCost: number }>;
	};
};
type BalanceMap = Record<string, BalanceLike> | undefined;

const getBalances = ({
	customer,
}: {
	customer: models.Customer | models.Entity;
}): BalanceMap => {
	return customer.balances as BalanceMap;
};

const getFeatureBalance = ({
	customer,
	featureId,
	requiredBalance = 1,
}: {
	customer: models.Customer | models.Entity;
	featureId: string;
	requiredBalance?: number;
}) => {
	const balances = getBalances({ customer });
	const featureBalance = balances?.[featureId];

	if (
		featureBalance &&
		typeof featureBalance.currentBalance === "number" &&
		featureBalance.currentBalance >= requiredBalance
	) {
		return {
			featureBalance,
			requiredBalance,
		};
	}

	const creditBalance = Object.values(balances ?? {}).find((balance) =>
		balance.feature?.creditSchema?.some(
			(creditSchema) => creditSchema.meteredFeatureId === featureId,
		),
	);

	if (creditBalance) {
		const creditSchema = creditBalance.feature?.creditSchema?.find(
			(schemaItem) => schemaItem.meteredFeatureId === featureId,
		);

		if (!creditSchema) {
			return {
				featureBalance: undefined,
				requiredBalance,
			};
		}

		return {
			featureBalance: creditBalance,
			requiredBalance: creditSchema.creditCost * requiredBalance,
		};
	}

	return {
		featureBalance,
		requiredBalance,
	};
};

const getFeatureAllowed = ({
	featureBalance,
	requiredBalance,
}: {
	featureBalance: BalanceLike | undefined;
	requiredBalance: number;
}) => {
	if (!featureBalance) return false;
	if (featureBalance.unlimited || featureBalance.overageAllowed) return true;
	return (featureBalance.currentBalance || 0) >= requiredBalance;
};

const getProductAllowed = ({
	customer,
	productId,
}: {
	customer: models.Customer | models.Entity;
	productId: string;
}) => {
	const activeSubscription = customer.subscriptions?.find(
		(subscription) =>
			subscription.planId === productId && subscription.status === "active",
	);

	return Boolean(activeSubscription);
};

const getCustomerId = ({
	customer,
	isEntity,
}: {
	customer: models.Customer | models.Entity;
	isEntity?: boolean;
}) => {
	if (isEntity) {
		return (customer as models.Entity).customerId || "";
	}

	return customer.id || "";
};

const handleFeatureCheck = ({
	customer,
	isEntity,
	params,
}: {
	customer: models.Customer | models.Entity;
	isEntity?: boolean;
	params: AllowedParams;
}) => {
	const { featureBalance, requiredBalance } = getFeatureBalance({
		customer,
		featureId: params.featureId!,
		...(params.requiredBalance
			? { requiredBalance: params.requiredBalance }
			: {}),
	});

	const allowed = getFeatureAllowed({
		featureBalance,
		requiredBalance: requiredBalance ?? 1,
	});

	const result = {
		allowed,
		customerId: getCustomerId({ customer, isEntity }),
		requiredBalance,
		balance: null,
	} as operations.PostCheckResponse;

	if (isEntity) {
		result.entityId = (customer as models.Entity).id;
	}

	return result;
};

const handleProductCheck = ({
	customer,
	isEntity,
	params,
}: {
	customer: models.Customer | models.Entity;
	isEntity?: boolean;
	params: AllowedParams;
}) => {
	const allowed = getProductAllowed({
		customer,
		productId: params.productId!,
	});

	const result = {
		allowed,
		customerId: getCustomerId({ customer, isEntity }),
		requiredBalance: 0,
		balance: null,
	} as operations.PostCheckResponse;

	if (isEntity) {
		result.entityId = (customer as models.Entity).id;
	}

	return result;
};

export const openDialog = ({
	result,
	params,
	context,
}: {
	result: operations.PostCheckResponse | null;
	params: CheckParams;
	context: AutumnContextParams;
}) => {
	const open = result?.allowed === false && params.dialog && context;

	if (!open) return;

	const isInRenderCycle = (() => {
		const stack = new Error().stack || "";
		return (
			stack.includes("renderWithHooks") ||
			stack.includes("updateFunctionComponent") ||
			stack.includes("beginWork") ||
			stack.includes("performUnitOfWork") ||
			stack.includes("workLoop") ||
			stack.includes("Component.render") ||
			stack.includes("FunctionComponent")
		);
	})();

	if (isInRenderCycle) {
		context.paywallRef.current = {
			component: params.dialog,
			open: true,
			props: params,
		};
	} else {
		context.paywallDialog.setComponent(params.dialog);
		context.paywallDialog.setProps(params);
		context.paywallDialog.setOpen(true);
	}
};

export const handleCheck = ({
	customer,
	isEntity,
	params,
}: {
	customer: models.Customer | models.Entity | null;
	isEntity?: boolean;
	params: CheckParams;
	context?: AutumnContextParams;
}): operations.PostCheckResponse => {
	if (!customer) {
		return {
			allowed: false,
			customerId: "",
			requiredBalance: 0,
			balance: null,
		} as operations.PostCheckResponse;
	}

	if (!params.featureId && !params.productId) {
		throw new Error("allowed() requires either featureId or productId");
	}

	if (params.productId && !params.featureId) {
		return handleProductCheck({ customer, params, isEntity });
	}

	return handleFeatureCheck({ customer, params, isEntity });
};
