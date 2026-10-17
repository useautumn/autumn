import type { ViolationValue } from "../../types/approvalViolation";
import type { FilterField, FilterMatchContext } from "../filterFieldTypes";

type LeafArgs<Parent> = {
	filter: unknown;
	parent: Parent;
	context: FilterMatchContext;
};

/** A field that is one condition: on a match it reports itself at its own path. */
export const leafField = <Parent>({
	label,
	matches,
	describeCondition,
	describeActual,
}: {
	label: string;
	matches: (args: LeafArgs<Parent>) => boolean;
	describeCondition: (args: { filter: unknown }) => ViolationValue;
	describeActual: (args: LeafArgs<Parent>) => ViolationValue;
}): FilterField<Parent> => ({
	label,
	describeCondition,
	match: ({ filter, parent, path, context }) => {
		if (!matches({ filter, parent, context })) return { result: "no_match" };
		return {
			result: "match",
			conditions: [
				{
					field: path,
					label,
					limit: describeCondition({ filter }),
					actual: describeActual({ filter, parent, context }),
				},
			],
		};
	},
});
