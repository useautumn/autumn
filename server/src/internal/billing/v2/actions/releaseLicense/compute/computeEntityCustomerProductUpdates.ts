import type { FullCusProduct } from "@autumn/shared";

export const computeEntityCustomerProductUpdates = ({
	assignments,
	releasedAt,
}: {
	assignments: FullCusProduct[];
	releasedAt: number;
}) =>
	assignments.map((assignment) => ({
		customerProduct: assignment,
		updates: {
			internal_entity_id: null,
			entity_id: null,
			released_at: releasedAt,
		},
	}));
