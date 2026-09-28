import {
	type Feature,
	findFeatureById,
	numberWithCommas,
	type PreviewBalance,
	type PreviewBalanceChange,
	type SetPlansPreviewPhase,
} from "@autumn/shared";
import { formatPhaseDate, phaseLabel } from "./phaseTiming";
import {
	joinDetail,
	summarizeCounts,
	withoutEmptyPhases,
} from "./reviewSectionText";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeStatus,
	ReviewChangeValue,
} from "./types/reviewChange";

type BalanceTransition = { before: PreviewBalance; after: PreviewBalance };

type BalanceBehavior = Extract<
	ReviewChangeStatus,
	"added" | "removed" | "reset" | "carried" | "updated"
>;

const BEHAVIOR_SUMMARY_LABELS: [BalanceBehavior, string][] = [
	["reset", "reset"],
	["carried", "carried over"],
	["added", "new"],
	["removed", "removed"],
	["updated", "updated"],
];

/** `previous_attributes` is sparse — overlay it on the after-state for the before-state. */
const balanceBefore = (change: PreviewBalanceChange): PreviewBalance => ({
	...change.balance,
	...(change.previous_attributes as Partial<PreviewBalance>),
});

const classifyBalanceChange = ({
	before,
	after,
}: BalanceTransition): BalanceBehavior => {
	if (!before.unlimited && after.unlimited) return "added";
	if (before.unlimited && !after.unlimited && after.granted === 0) {
		return "removed";
	}
	if (before.granted === 0 && before.usage === 0 && after.granted > 0) {
		return "added";
	}
	if (after.granted === 0 && before.granted > 0) return "removed";
	if (before.usage > 0 && after.usage === 0) return "reset";
	if (after.usage > 0 && after.usage === before.usage) return "carried";
	return "updated";
};

const describeGranted = ({ before, after }: BalanceTransition) =>
	before.granted === after.granted || before.granted === 0
		? `${numberWithCommas(after.granted)} granted`
		: `${numberWithCommas(before.granted)} → ${numberWithCommas(after.granted)} granted`;

const describeReset = ({ before, after }: BalanceTransition) => {
	if (before.next_reset_at === after.next_reset_at) return undefined;
	if (after.next_reset_at === null) return undefined;
	return `resets ${formatPhaseDate({ startsAt: after.next_reset_at })}`;
};

/** Every number is labelled so the row reads as "<feature>: granted, used, left". */
const describeBalance = ({ before, after }: BalanceTransition) => {
	if (after.unlimited) return "Unlimited";
	return joinDetail([
		describeGranted({ before, after }),
		`${numberWithCommas(after.usage)} used`,
		describeReset({ before, after }),
	]);
};

const balanceValue = (balance: PreviewBalance): ReviewChangeValue => {
	if (balance.unlimited) return { amount: "Unlimited" };
	return {
		amount: numberWithCommas(balance.remaining),
		suffix: `of ${numberWithCommas(balance.granted)} left`,
	};
};

const balanceChangeToRow = ({
	change,
	phaseIndex,
	features,
}: {
	change: PreviewBalanceChange;
	phaseIndex: number;
	features: Feature[];
}): ReviewChangeRow => {
	const before = balanceBefore(change);
	const after = change.balance;
	const behavior = classifyBalanceChange({ before, after });
	const feature = findFeatureById({ features, featureId: change.feature_id });

	return {
		key: `balance-${phaseIndex}-${change.feature_id}`,
		title: feature?.name ?? change.feature_id,
		description: describeBalance({ before, after }),
		status: behavior,
		value: balanceValue(after),
	};
};

export const balanceChangesToReviewSection = ({
	phases,
	features,
	nowMs,
}: {
	phases: SetPlansPreviewPhase[];
	features: Feature[];
	nowMs: number;
}): ReviewChangeSection => {
	const phaseRows = phases.map((phase, phaseIndex) => ({
		key: `balances-${phaseIndex}`,
		label: phaseLabel({ phaseIndex, startsAt: phase.starts_at, nowMs }),
		rows: phase.balance_changes.map((change) =>
			balanceChangeToRow({ change, phaseIndex, features }),
		),
	}));
	const rows = phaseRows.flatMap((phase) => phase.rows);

	return {
		phases: withoutEmptyPhases(phaseRows),
		summary: summarizeCounts({
			counts: BEHAVIOR_SUMMARY_LABELS.map(([behavior, label]) => [
				label,
				rows.filter((row) => row.status === behavior).length,
			]),
			emptyLabel: "No changes",
		}),
	};
};
