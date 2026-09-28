import type {
	SubscriptionMismatch,
	SyncPlanInstance,
	SyncProposalV2,
} from "@autumn/shared";
import { format } from "date-fns";

export type ProposalSyncState =
	| "in_sync"
	| "out_of_sync"
	| "linked"
	| "ready_to_link"
	| "no_match"
	| "change_scheduled";

export type ProposalSyncSummary = {
	state: ProposalSyncState;
	planNames: string[];
	note: string;
};

const planNamesOf = ({
	plans,
	productNamesById,
}: {
	plans: SyncPlanInstance[];
	productNamesById: Record<string, string>;
}) => plans.map(({ plan_id }) => productNamesById[plan_id] ?? plan_id);

const scheduledChangeNote = ({
	proposal,
	productNamesById,
}: {
	proposal: SyncProposalV2;
	productNamesById: Record<string, string>;
}) => {
	const nextPhase = proposal.phases[1];
	if (!nextPhase || nextPhase.starts_at === "now") return undefined;
	const names = planNamesOf({ plans: nextPhase.plans, productNamesById });
	const date = format(nextPhase.starts_at, "MMM d, yyyy");
	return names.length > 0
		? `Moves to ${names.join(", ")} on ${date}`
		: `Changes on ${date}`;
};

export const proposalSyncSummary = ({
	proposal,
	mismatches,
	productNamesById,
}: {
	proposal: SyncProposalV2;
	mismatches: SubscriptionMismatch[] | undefined;
	productNamesById: Record<string, string>;
}): ProposalSyncSummary => {
	const linkedPlanId = proposal.already_linked_product_id;
	const matchedPlanNames = planNamesOf({
		plans: proposal.phases[0]?.plans ?? [],
		productNamesById,
	});

	if (!linkedPlanId) {
		if (matchedPlanNames.length === 0) {
			return {
				state: "no_match",
				planNames: [],
				note: "No Autumn plan uses these prices",
			};
		}
		return {
			state: "ready_to_link",
			planNames: matchedPlanNames,
			note: `Matches ${matchedPlanNames.join(", ")}`,
		};
	}

	const planNames = [productNamesById[linkedPlanId] ?? linkedPlanId];
	const firstMismatch = mismatches?.[0];
	if (firstMismatch) {
		return {
			state: "out_of_sync",
			planNames,
			note: firstMismatch.message ?? "Stripe and Autumn differ",
		};
	}

	const scheduledNote = scheduledChangeNote({ proposal, productNamesById });
	if (scheduledNote) {
		return { state: "change_scheduled", planNames, note: scheduledNote };
	}

	if (!mismatches) {
		return { state: "linked", planNames, note: `Linked to ${planNames[0]}` };
	}

	return { state: "in_sync", planNames, note: "Stripe and Autumn match" };
};
