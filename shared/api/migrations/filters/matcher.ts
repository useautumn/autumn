import { z } from "zod/v4";

/**
 * Mongo-style matchers for migration filters.
 *
 * Rules:
 * - Bare value = equality (Mongo convention). `feature_id: "credits"` ≡
 *   `feature_id: { $eq: "credits" }`.
 * - `null` is a valid bare value: `price: null` matches null fields.
 * - Object form lets the caller use operators ($in, $ne, $gt, $regex, ...).
 * - Operator keys are prefixed with `$` to disambiguate from nested-object
 *   filters. Keys without `$` are treated as field names on the resource.
 */

export const StringMatcherSchema = z.union([
	z.string(),
	z.null(),
	z.object({
		$eq: z.union([z.string(), z.null()]).optional(),
		$ne: z.union([z.string(), z.null()]).optional(),
		$in: z.array(z.string()).optional(),
		$nin: z.array(z.string()).optional(),
		$regex: z.string().optional(),
		$startsWith: z.string().optional(),
	}),
]);

export type StringMatcher = z.infer<typeof StringMatcherSchema>;

export const NumberMatcherSchema = z.union([
	z.number(),
	z.null(),
	z.object({
		$eq: z.union([z.number(), z.null()]).optional(),
		$ne: z.union([z.number(), z.null()]).optional(),
		$in: z.array(z.number()).optional(),
		$nin: z.array(z.number()).optional(),
		$gt: z.number().optional(),
		$gte: z.number().optional(),
		$lt: z.number().optional(),
		$lte: z.number().optional(),
	}),
]);

export type NumberMatcher = z.infer<typeof NumberMatcherSchema>;

export const BooleanMatcherSchema = z.boolean();
export type BooleanMatcher = z.infer<typeof BooleanMatcherSchema>;

/** Build a string-enum matcher: bare literal, null, or { $eq, $ne, $in, $nin }. */
export const enumMatcher = <T extends readonly [string, ...string[]]>(
	values: T,
) => {
	const literal = z.enum(values);
	return z.union([
		literal,
		z.null(),
		z.object({
			$eq: z.union([literal, z.null()]).optional(),
			$ne: z.union([literal, z.null()]).optional(),
			$in: z.array(literal).optional(),
			$nin: z.array(literal).optional(),
		}),
	]);
};

/**
 * Wrap a nested-object filter with null-equality shorthand. Allows callers to
 * write `price: null` (matches null), `price: { $ne: null }` (matches
 * non-null), or `price: { interval: "month" }` (non-null AND nested matches).
 */
export const nullableObjectFilter = <T extends z.ZodTypeAny>(inner: T) =>
	z.union([
		z.null(),
		z.object({
			$eq: z.null().optional(),
			$ne: z.null().optional(),
		}),
		inner,
	]);
