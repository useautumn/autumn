import type { FullCustomer } from "../../../../../models/cusModels/fullCusModel";
import { customerFilterMatchesFullCustomer } from "../../../../customers/utils/match/customerFilterMatchesFullCustomer";
import type { CustomerFilter } from "../../../../migrations/filters/customerFilter";
import { describeStringMatcher } from "../format/describeStringMatcher";
import { leafField } from "./leafField";

/** The migration `CustomerFilter`, matched by the existing in-memory matcher. */
export const customerField = <Parent>({
	label,
	read,
}: {
	label: string;
	read: (parent: Parent) => FullCustomer;
}) =>
	leafField<Parent>({
		label,
		matches: ({ filter, parent }) =>
			customerFilterMatchesFullCustomer({
				filter: filter as CustomerFilter,
				fullCustomer: read(parent),
			}),
		describeLimit: ({ filter }) => {
			const { customer_id } = filter as CustomerFilter;
			return customer_id === undefined
				? "matching customer"
				: describeStringMatcher({ matcher: customer_id });
		},
		describeActual: ({ parent }) => read(parent).id ?? "none",
	});
