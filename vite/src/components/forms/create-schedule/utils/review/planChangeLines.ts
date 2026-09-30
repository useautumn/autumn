import type {
	CustomerPlanChange,
	Feature,
	PlanItemChangeV0,
} from "@autumn/shared";
import type { ItemStatusState } from "@/components/v2/ItemStatusDot";
import { formatPhaseDate } from "../schedulePhaseTiming";

export type ReviewChangeLine = { state: ItemStatusState; text: string };

const formatDate = (ms: number) => formatPhaseDate({ startsAt: ms });
const updated = (text: string): ReviewChangeLine => ({
	state: "updated",
	text,
});

const lifecycleLines = (change: CustomerPlanChange): ReviewChangeLine[] => {
	const previous = change.previous_attributes;
	if (!previous) return [];
	const subscription = change.subscription;
	const lines: ReviewChangeLine[] = [];

	if ("expires_at" in previous) {
		const expiresAt =
			subscription?.expires_at ?? change.purchase?.expires_at ?? null;
		if (expiresAt !== null)
			lines.push(updated(`Ends ${formatDate(expiresAt)}`));
		else if (previous.expires_at)
			lines.push(updated(`No longer ends ${formatDate(previous.expires_at)}`));
	}
	if ("trial_ends_at" in previous) {
		const trialEndsAt = subscription?.trial_ends_at ?? null;
		lines.push(
			updated(
				trialEndsAt === null
					? "Trial ended"
					: `Trial now ends ${formatDate(trialEndsAt)}`,
			),
		);
	}
	if ("canceled_at" in previous) {
		lines.push(
			updated(subscription?.canceled_at ? "Canceled" : "Cancellation removed"),
		);
	}
	if (previous.past_due && !subscription?.past_due) {
		lines.push(updated("No longer past due"));
	}
	return lines;
};

const planContentLines = ({
	change,
	features,
}: {
	change: CustomerPlanChange;
	features: Feature[];
}): ReviewChangeLine[] => {
	const planChange = change.plan_change;
	if (!planChange) return [];
	const featureName = (featureId: string) =>
		features.find((feature) => feature.id === featureId)?.name ?? featureId;

	return [
		...(planChange.price_change ? [updated("Price changed")] : []),
		...(planChange.free_trial_change ? [updated("Free trial changed")] : []),
		...planChange.item_changes.map(
			(itemChange: PlanItemChangeV0): ReviewChangeLine =>
				itemChange.action === "created"
					? {
							state: "new",
							text: `${featureName(itemChange.feature_id)} added`,
						}
					: {
							state: "removed",
							text: `${featureName(itemChange.feature_id)} removed`,
						},
		),
	];
};

/** What changed on an updated plan, read from the preview's plan_changes. */
export const planChangeLines = ({
	change,
	features,
}: {
	change: CustomerPlanChange;
	features: Feature[];
}): ReviewChangeLine[] => [
	...lifecycleLines(change),
	...planContentLines({ change, features }),
];

export const findPlanChange = ({
	planChanges,
	planId,
	entityId,
}: {
	planChanges: CustomerPlanChange[];
	planId: string;
	entityId: string | null;
}) =>
	planChanges.find(
		(change) =>
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId &&
			(change.entity_id ?? null) === entityId,
	);
