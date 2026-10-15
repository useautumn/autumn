import type { WhenField, WhenMatchContext } from "../whenFieldTypes";

/** A field that reports at its own path when its filter doesn't match. */
export const leafField = <Parent>({
	label,
	matches,
	describeLimit,
	describeActual,
	describeLimits,
}: Omit<WhenField<Parent>, "check"> & {
	matches: (args: {
		filter: unknown;
		parent: Parent;
		context: WhenMatchContext;
	}) => boolean;
}): WhenField<Parent> => ({
	label,
	describeLimit,
	describeActual,
	describeLimits,
	check: ({ filter, parent, path, context }) =>
		matches({ filter, parent, context })
			? null
			: {
					field: path,
					label,
					limit: describeLimit({ filter }),
					actual: describeActual({ filter, parent, context }),
				},
});
