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
		// Quantifier wrapper must come first and assert a `$`-key is present:
		// `element` is a permissive object that would otherwise strip `$some`/
		// `$none`/`$every` down to `{}` and silently swallow the quantifier.
		z
			.object({
				$some: element.optional(),
				$every: element.optional(),
				$none: element.optional(),
			})
			.refine(
				(v) =>
					v.$some !== undefined ||
					v.$every !== undefined ||
					v.$none !== undefined,
				{ message: "quantifier object requires $some, $every, or $none" },
			),
		element,
	]);
