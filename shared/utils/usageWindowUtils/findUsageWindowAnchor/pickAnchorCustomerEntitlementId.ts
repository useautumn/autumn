import type { UsageWindowScope } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";

/**
 * A candidate customer entitlement for owning a usage-window counter, reduced to
 * just the fields the canonical pick depends on. Deliberately decoupled from the
 * deduction set and its ordering so the chosen anchor is stable regardless of
 * deduction order, filters, or reverse_deduction_order.
 */
export type AnchorCandidate = {
	id: string;
	is_entity_scoped: boolean;
	is_add_on: boolean;
	// Product-backed ents outrank loose/top-up grants: their reset cycle is
	// what window bounds align to.
	is_plan_backed: boolean;
	// Lower rank = higher priority (e.g. active before past_due).
	status_rank: number;
	created_at: number;
};

/**
 * Deterministically picks the single customer entitlement that owns a usage
 * window, so one logical counter is never split across entitlements.
 *
 * Customer-scope counters must live on a customer-level entitlement (returns
 * null if only entity-scoped ones exist, so the caller can fail closed rather
 * than split the cap per entity). Entity-scope prefers an entity-owned one.
 */
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
