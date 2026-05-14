import { z } from "zod/v4";

/**
 * Array-navigation aggregations. Use one of:
 * - `$some` — at least one element matches (the implicit default if you
 *   pass a bare element filter, e.g. `item: { feature_id: "credits" }`).
 * - `$every` — all elements match.
 * - `$none` — no elements match.
 *
 * `$count` and group-by predicates are intentionally NOT supported here —
 * those belong in a higher-level Selector layer.
 */
export const arrayFilter = <T extends z.ZodTypeAny>(element: T) =>
	z.union([
		element,
		z.object({
			$some: element.optional(),
			$every: element.optional(),
			$none: element.optional(),
		}),
	]);
