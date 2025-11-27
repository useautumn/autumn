import {
	type ApiCustomer,
	type ApiEntityV1,
	CheckExpand,
} from "../api/models.js";
import { CusExpand } from "../models/cusModels/cusExpand.js";

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

export const expandIncludes = ({
	expand,
	includes,
}: {
	expand: string[];
	includes: string[];
}) => {
	return includes.some((i) => expand.includes(i));
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
		includes: [CusExpand.BalancesFeature, CheckExpand.BalanceFeature],
	});

	if (!expandBalanceFeature && target.balances) {
		for (const featureId in target.balances) {
			target.balances[featureId].feature = undefined;
		}
	}

	const expandSubscriptionPlan = expandIncludes({
		expand,
		includes: [CusExpand.SubscriptionsPlan],
	});

	if (!expandSubscriptionPlan && target.subscriptions) {
		for (let i = 0; i < target.subscriptions?.length; i++) {
			target.subscriptions[i].plan = undefined;
		}
	}

	const expandScheduledSubscriptionPlan = expandIncludes({
		expand,
		includes: [CusExpand.ScheduledSubscriptionsPlan],
	});

	if (!expandScheduledSubscriptionPlan && target.scheduled_subscriptions) {
		for (let i = 0; i < target.scheduled_subscriptions?.length; i++) {
			target.scheduled_subscriptions[i].plan = undefined;
		}
	}

	return target as T;
};
