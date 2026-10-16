import { z } from "zod/v4";
import { ResetInterval } from "../../../../models/productModels/intervals/resetInterval";
import {
	BooleanMatcherSchema,
	enumMatcher,
	NumberMatcherSchema,
	nullableObjectFilter,
} from "../../../common/filters/matcher";
import { buildFilterSchema, type FilterOf } from "./buildFilterSchema";
import { RelativeDateMatcherSchema, sharedFilterFields } from "./filterFields";

type ResetIntervalValue = `${ResetInterval}`;

const RESET_INTERVALS = Object.values(ResetInterval) as [
	ResetIntervalValue,
	...ResetIntervalValue[],
];

/** Grant credits: `balances.create` params. Amounts are in the feature's unit. */
export const balanceCreateFilterShape = {
	customer: sharedFilterFields.customer,
	feature_id: sharedFilterFields.feature_id,
	included_grant: sharedFilterFields.included_grant,
	unlimited: BooleanMatcherSchema.optional(),
	expires_at: RelativeDateMatcherSchema.optional(),
	reset: nullableObjectFilter(
		z.object({ interval: enumMatcher(RESET_INTERVALS).optional() }),
	).optional(),
};

export const BalanceCreateFilterSchema = buildFilterSchema({
	shape: balanceCreateFilterShape,
});
export type BalanceCreateFilter = FilterOf<typeof balanceCreateFilterShape>;

/** Set balance: `balances.update` params. */
export const balanceUpdateFilterShape = {
	customer: sharedFilterFields.customer,
	feature_id: sharedFilterFields.feature_id,
	included_grant: sharedFilterFields.included_grant,
	add_to_balance: NumberMatcherSchema.optional(),
	remaining: NumberMatcherSchema.optional(),
	usage: NumberMatcherSchema.optional(),
};

export const BalanceUpdateFilterSchema = buildFilterSchema({
	shape: balanceUpdateFilterShape,
});
export type BalanceUpdateFilter = FilterOf<typeof balanceUpdateFilterShape>;
