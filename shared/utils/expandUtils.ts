import { CustomerExpand } from "../api/customers/components/customerExpand/customerExpand.js";
import {
	type ApiCustomer,
	type ApiEntityV1,
	CheckExpand,
} from "../api/models.js";

export const addToExpand = <T extends { expand: string[] }>({
	ctx,
	add,
}: {
	ctx: T;
	add: string[];
}): T => {
	return {
		...ctx,
		expand: [...ctx.expand, ...add],
	};
};

export const filterExpand = ({
	expand,
	filter,
}: {
	expand: string[];
	filter: string[];
}) => {
	return expand.filter((e) => !filter.includes(e));
};

/** @deprecated Use expandPathIncludes for path-aware expand matching. */
export const expandIncludes = ({
	expand,
	includes,
}: {
	expand: string[];
	includes: string[];
}) => {
	return includes.some((i) => expand.includes(i));
};

/** Returns true when an expand path matches exactly or requests a deeper child path. */
export const expandPathIncludes = ({
	expand,
	includes,
}: {
	expand: string[];
	includes: string[];
}) => {
	return includes.some((include) =>
		expand.some(
			(entry) => entry === include || entry.startsWith(`${include}.`),
		),
	);
};

/** Returns a new context whose expand paths are scoped to the given subtree. */
export const scopeExpandForCtx = <T extends { expand: string[] }>({
	ctx,
	prefix,
}: {
	ctx: T;
	prefix: string;
}): T => {
	return {
		...ctx,
		expand: ctx.expand.flatMap((entry) => {
			if (entry === prefix) return [""];
			if (entry.startsWith(`${prefix}.`)) {
				return [entry.slice(prefix.length + 1)];
			}
			return [];
		}),
	};
};

export const filterPlanAndFeatureExpand = <
	T extends ApiCustomer | ApiEntityV1,
>({
	expand,
	target,
}: {
	expand: string[];
	target: ApiCustomer | ApiEntityV1;
}): T => {
	const expandBalanceFeature = expandIncludes({
		expand,
		includes: [CustomerExpand.BalancesFeature, CheckExpand.BalanceFeature],
	});

	if (!expandBalanceFeature && target.balances) {
		for (const featureId in target.balances) {
			target.balances[featureId].feature = undefined;
		}
	}

	const expandSubscriptionPlan = expandIncludes({
		expand,
		includes: [CustomerExpand.SubscriptionsPlan],
	});

	if (!expandSubscriptionPlan && target.subscriptions) {
		for (let i = 0; i < target.subscriptions?.length; i++) {
			target.subscriptions[i].plan = undefined;
		}
	}

	const expandScheduledSubscriptionPlan = expandIncludes({
		expand,
		includes: [CustomerExpand.PurchasesPlan],
	});

	if (!expandScheduledSubscriptionPlan && target.scheduled_subscriptions) {
		for (let i = 0; i < target.scheduled_subscriptions?.length; i++) {
			target.scheduled_subscriptions[i].plan = undefined;
		}
	}

	return target as T;
};
