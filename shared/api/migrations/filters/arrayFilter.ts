import { z } from "zod/v4";

export const arrayFilter = <T extends z.ZodTypeAny>(element: T) =>
	z.union([
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
