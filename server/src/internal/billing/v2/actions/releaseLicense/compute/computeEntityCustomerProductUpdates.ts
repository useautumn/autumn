import type { FullCusProduct } from "@autumn/shared";

/** Unlink each seat from its entity, stamping when it returned to the pool. */
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
