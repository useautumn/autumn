import { customerFilterMatchesFullCustomer } from "@api/customers/utils/match/customerFilterMatchesFullCustomer";
import type { CustomerFilter } from "@api/migrations/filters/customerFilter";
import type { FullCustomer } from "@models/cusModels/fullCusModel";
import { describeStringMatcher } from "../format/describeStringMatcher";
import { leafField } from "./leafField";

/** The migration `CustomerFilter`, matched by the existing in-memory matcher. */
export const customerField = <Parent>({
	read,
}: {
	read: (parent: Parent) => FullCustomer;
}) =>
	leafField<Parent>({
		label: "Customer",
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
