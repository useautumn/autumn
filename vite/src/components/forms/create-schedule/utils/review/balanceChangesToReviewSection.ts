import {
	type Feature,
	findFeatureById,
	type PreviewBalance,
	type PreviewBalanceChange,
	type SetPlansPreviewPhase,
} from "@autumn/shared";
import {
	formatPhaseDate,
	futurePhasePrefix,
	joinDetail,
	summarizeCounts,
} from "./phaseTiming";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeTone,
} from "./types/reviewChange";

type BalanceBehavior = "added" | "removed" | "reset" | "carried" | "updated";

const BEHAVIOR_ORDER: BalanceBehavior[] = [
	"reset",
	"carried",
	"added",
	"removed",
	"updated",
];

const BEHAVIOR_TONE: Record<BalanceBehavior, ReviewChangeTone> = {
	added: "new",
	removed: "ending",
	reset: "changed",
	carried: "kept",
	updated: "kept",
};

const BEHAVIOR_LABEL: Record<BalanceBehavior, string> = {
	added: "New",
	removed: "Removed",
	reset: "Reset",
	carried: "Carried over",
	updated: "Updated",
};

const BEHAVIOR_SUMMARY_LABEL: Record<BalanceBehavior, string> = {
	added: "new",
	removed: "removed",
	reset: "reset",
	carried: "carried over",
	updated: "updated",
};

/** `previous_attributes` is sparse — overlay it on the after-state for the before-state. */
const balanceBefore = (change: PreviewBalanceChange): PreviewBalance => ({
	...change.balance,
	...(change.previous_attributes as Partial<PreviewBalance>),
});

const classifyBalanceChange = ({
	before,
	after,
}: {
	before: PreviewBalance;
	after: PreviewBalance;
}): BalanceBehavior => {
	if (before.granted === 0 && before.usage === 0 && after.granted > 0) {
		return "added";
	}
	if (after.granted === 0 && before.granted > 0) return "removed";
	if (before.usage > 0 && after.usage === 0) return "reset";
	if (after.usage > 0 && after.usage === before.usage) return "carried";
	return "updated";
};

const formatQuantity = (value: number) => value.toLocaleString();

const describeFieldChange = ({
	label,
	before,
	after,
}: {
	label: string;
	before: number;
	after: number;
}) =>
	before === after
		? undefined
		: `${label} ${formatQuantity(before)} → ${formatQuantity(after)}`;

const describeResetChange = ({
	before,
	after,
}: {
	before: number | null;
	after: number | null;
}) => {
	if (before === after || after === null) return undefined;
	return `Resets ${formatPhaseDate({ startsAt: after })}`;
};

const balanceValue = (balance: PreviewBalance) =>
	balance.unlimited ? "Unlimited" : `${formatQuantity(balance.remaining)} left`;

const balanceChangeToRow = ({
	change,
	phaseIndex,
	startsAt,
	features,
}: {
	change: PreviewBalanceChange;
	phaseIndex: number;
	startsAt: number;
	features: Feature[];
}): ReviewChangeRow & { behavior: BalanceBehavior } => {
	const before = balanceBefore(change);
	const after = change.balance;
	const behavior = classifyBalanceChange({ before, after });
	const feature = findFeatureById({ features, featureId: change.feature_id });

	return {
		key: `balance-${phaseIndex}-${change.feature_id}`,
		behavior,
		icon: "balance",
		title: feature?.name ?? change.feature_id,
		detail: joinDetail([
			futurePhasePrefix({ phaseIndex, startsAt }),
			describeFieldChange({
				label: "Granted",
				before: before.granted,
				after: after.granted,
			}),
			describeFieldChange({
				label: "Usage",
				before: before.usage,
				after: after.usage,
			}),
			describeResetChange({
				before: before.next_reset_at,
				after: after.next_reset_at,
			}),
		]),
		tone: BEHAVIOR_TONE[behavior],
		label: BEHAVIOR_LABEL[behavior],
		value: balanceValue(after),
		isEnding: behavior === "removed",
	};
};

export const balanceChangesToReviewSection = ({
	phases,
	features,
}: {
	phases: SetPlansPreviewPhase[];
	features: Feature[];
}): ReviewChangeSection => {
	const rows = phases.flatMap((phase, phaseIndex) =>
		phase.balance_changes.map((change) =>
			balanceChangeToRow({
				change,
				phaseIndex,
				startsAt: phase.starts_at,
				features,
			}),
		),
	);

	return {
		rows,
		summary: summarizeCounts({
			counts: BEHAVIOR_ORDER.map((behavior) => [
				BEHAVIOR_SUMMARY_LABEL[behavior],
				rows.filter((row) => row.behavior === behavior).length,
			]),
			emptyLabel: "No changes",
		}),
	};
};
