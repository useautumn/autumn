import type { CustomerFilter } from "../../../migrations/filters/customerFilter.js";

/** Does `filter` read `has_paid` anywhere, including inside `$and` / `$or`? */
export const customerFilterUsesHasPaid = ({
	filter,
}: {
	filter: CustomerFilter;
}): boolean => {
	if (filter.has_paid !== undefined) return true;

	const branches = [...(filter.$and ?? []), ...(filter.$or ?? [])];
	return branches.some((branch) =>
		customerFilterUsesHasPaid({ filter: branch }),
	);
};
