import {
	type Feature,
	findFeatureById,
	numberWithCommas,
	type SetPlansPreviewBalance,
	type SetPlansPreviewBalanceChange,
	type SetPlansPreviewPhase,
} from "@autumn/shared";
import { formatPhaseDate } from "../schedulePhaseTiming";
import { phaseLabel } from "./phaseTiming";
import {
	joinDetail,
	summarizeCounts,
	withoutEmptyPhases,
} from "./reviewSectionText";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeValue,
} from "./types/reviewChange";

type BalanceTransition = {
	before: SetPlansPreviewBalance;
	after: SetPlansPreviewBalance;
};

const BEHAVIOR_SUMMARY_LABELS: [
	SetPlansPreviewBalanceChange["behavior"],
	string,
][] = [
	["reset", "reset"],
	["carried", "carried over"],
	["added", "new"],
	["removed", "removed"],
	["updated", "updated"],
];

/** `previous_attributes` is sparse — overlay it on the after-state for the before-state. */
const balanceBefore = (
	change: SetPlansPreviewBalanceChange,
): SetPlansPreviewBalance => ({
	...change.balance,
	...(change.previous_attributes as Partial<SetPlansPreviewBalance>),
});

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

const isPayPerUse = (balance: SetPlansPreviewBalance) =>
	balance.overage_allowed && balance.granted === 0;

const balanceValue = (balance: SetPlansPreviewBalance): ReviewChangeValue => {
	if (balance.unlimited) return { amount: "Unlimited" };
	if (isPayPerUse(balance)) return { amount: "Usage-based", isBasis: true };
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
	change: SetPlansPreviewBalanceChange;
	phaseIndex: number;
	features: Feature[];
}): ReviewChangeRow => {
	const before = balanceBefore(change);
	const after = change.balance;
	const feature = findFeatureById({ features, featureId: change.feature_id });
	const featureName = feature?.name ?? change.feature_id;

	return {
		key: `balance-${phaseIndex}-${change.entity_id ?? "customer"}-${change.feature_id}`,
		title: featureName,
		description: describeBalance({ before, after }),
		status: change.behavior,
		...(change.pooled && {
			pooled: {
				featureName,
				previousTotal: change.pooled.previous_total,
				total: change.pooled.total,
				contributors: change.pooled.contributors,
			},
		}),
		value: balanceValue(after),
		entityId: change.entity_id ?? null,
	};
};

export const balanceChangesToReviewSection = ({
	phases,
	features,
}: {
	phases: SetPlansPreviewPhase[];
	features: Feature[];
}): ReviewChangeSection => {
	const phaseRows = phases.map((phase, phaseIndex) => ({
		key: `balances-${phaseIndex}`,
		label: phaseLabel({ phase }),
		rows: phase.balance_changes.map((change) =>
			balanceChangeToRow({ change, phaseIndex, features }),
		),
	}));
	const changes = phases.flatMap((phase) => phase.balance_changes);

	return {
		phases: withoutEmptyPhases(phaseRows),
		summary: summarizeCounts({
			counts: BEHAVIOR_SUMMARY_LABELS.map(([behavior, label]) => [
				label,
				changes.filter((change) => change.behavior === behavior).length,
			]),
			emptyLabel: "No changes",
		}),
	};
};
