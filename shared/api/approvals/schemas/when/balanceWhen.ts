import {
	BooleanMatcherSchema,
	enumMatcher,
	NumberMatcherSchema,
	nullableObjectFilter,
} from "@api/common/filters/matcher";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { z } from "zod/v4";
import { buildWhenSchema, type WhenOf } from "./buildWhenSchema";
import { RelativeDateMatcherSchema, sharedWhenFields } from "./whenFields";

type ResetIntervalValue = `${ResetInterval}`;

const RESET_INTERVALS = Object.values(ResetInterval) as [
	ResetIntervalValue,
	...ResetIntervalValue[],
];

/** Grant credits: `balances.create` params. Amounts are in the feature's unit. */
export const balanceCreateWhenShape = {
	customer: sharedWhenFields.customer,
	feature_id: sharedWhenFields.feature_id,
	included_grant: sharedWhenFields.included_grant,
	unlimited: BooleanMatcherSchema.optional(),
	expires_at: RelativeDateMatcherSchema.optional(),
	reset: nullableObjectFilter(
		z.object({ interval: enumMatcher(RESET_INTERVALS).optional() }),
	).optional(),
};

export const BalanceCreateWhenSchema = buildWhenSchema({
	shape: balanceCreateWhenShape,
});
export type BalanceCreateWhen = WhenOf<typeof balanceCreateWhenShape>;

/** Set balance: `balances.update` params. */
export const balanceUpdateWhenShape = {
	customer: sharedWhenFields.customer,
	feature_id: sharedWhenFields.feature_id,
	included_grant: sharedWhenFields.included_grant,
	add_to_balance: NumberMatcherSchema.optional(),
	remaining: NumberMatcherSchema.optional(),
	usage: NumberMatcherSchema.optional(),
};

export const BalanceUpdateWhenSchema = buildWhenSchema({
	shape: balanceUpdateWhenShape,
});
export type BalanceUpdateWhen = WhenOf<typeof balanceUpdateWhenShape>;
