import { leafField } from "./leafField";

export const booleanField = <Parent>({
	label,
	read,
}: {
	label: string;
	read: (parent: Parent) => boolean;
}) =>
	leafField<Parent>({
		label,
		matches: ({ filter, parent }) => read(parent) === filter,
		describeCondition: ({ filter }) => filter === true,
		describeActual: ({ parent }) => read(parent),
	});
