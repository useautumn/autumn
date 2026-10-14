import type { UsageWindowScope } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";

export type AnchorCandidate = {
	id: string;
	is_entity_scoped: boolean;
	is_add_on: boolean;
	is_plan_backed: boolean;
	status_rank: number;
	created_at: number;
};

export const pickAnchorCustomerEntitlementId = ({
	candidates,
	scopeType,
}: {
	candidates: AnchorCandidate[];
	scopeType: UsageWindowScope;
}): string | null => {
	let eligible: AnchorCandidate[];
	if (scopeType === "customer") {
		eligible = candidates.filter((candidate) => !candidate.is_entity_scoped);
	} else {
		const entityScoped = candidates.filter(
			(candidate) => candidate.is_entity_scoped,
		);
		eligible = entityScoped.length > 0 ? entityScoped : candidates;
	}

	if (eligible.length === 0) {
		return null;
	}

	const sorted = [...eligible].sort((a, b) => {
		if (a.status_rank !== b.status_rank) return a.status_rank - b.status_rank;
		if (a.is_plan_backed !== b.is_plan_backed) return a.is_plan_backed ? -1 : 1;
		if (a.is_add_on !== b.is_add_on) return a.is_add_on ? 1 : -1;
		if (a.created_at !== b.created_at) return a.created_at - b.created_at;
		return a.id < b.id ? -1 : 1;
	});

	return sorted[0].id;
};
