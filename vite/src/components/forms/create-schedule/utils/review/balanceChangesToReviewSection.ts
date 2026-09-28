import {
	type Feature,
	findFeatureById,
	type PreviewBalance,
	type PreviewBalanceChange,
	type SetPlansPreviewPhase,
} from "@autumn/shared";
import {
	formatPhaseDate,
	joinDetail,
	phaseLabel,
	summarizeCounts,
	withoutEmptyPhases,
} from "./phaseTiming";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeStatus,
	ReviewChangeValue,
} from "./types/reviewChange";

type BalanceBehavior = Extract<
	ReviewChangeStatus,
	"added" | "removed" | "reset" | "carried" | "updated"
>;

const BEHAVIOR_ORDER: BalanceBehavior[] = [
	"reset",
	"carried",
	"added",
	"removed",
	"updated",
];

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

const describeGranted = ({
	before,
	after,
}: {
	before: PreviewBalance;
	after: PreviewBalance;
}) =>
	before.granted === after.granted || before.granted === 0
		? `${formatQuantity(after.granted)} granted`
		: `${formatQuantity(before.granted)} → ${formatQuantity(after.granted)} granted`;

const describeReset = ({
	before,
	after,
}: {
	before: PreviewBalance;
	after: PreviewBalance;
}) => {
	if (before.next_reset_at === after.next_reset_at) return undefined;
	if (after.next_reset_at === null) return undefined;
	return `resets ${formatPhaseDate({ startsAt: after.next_reset_at })}`;
};

/** Every number is labelled so the row reads as "<feature>: granted, used, left". */
const describeBalance = ({
	before,
	after,
}: {
	before: PreviewBalance;
	after: PreviewBalance;
}) => {
	if (after.unlimited) return "Unlimited";
	return joinDetail([
		describeGranted({ before, after }),
		`${formatQuantity(after.usage)} used`,
		describeReset({ before, after }),
	]);
};

const balanceValue = (balance: PreviewBalance): ReviewChangeValue => {
	if (balance.unlimited) return { amount: "Unlimited" };
	return {
		amount: formatQuantity(balance.remaining),
		suffix: `of ${formatQuantity(balance.granted)} left`,
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
}: {
	phases: SetPlansPreviewPhase[];
	features: Feature[];
}): ReviewChangeSection => {
	const phaseRows = phases.map((phase, phaseIndex) => ({
		key: `balances-${phaseIndex}`,
		label: phaseLabel({ phaseIndex, startsAt: phase.starts_at }),
		rows: phase.balance_changes.map((change) =>
			balanceChangeToRow({ change, phaseIndex, features }),
		),
	}));
	const rows = phaseRows.flatMap((phase) => phase.rows);

	return {
		phases: withoutEmptyPhases(phaseRows),
		summary: summarizeCounts({
			counts: BEHAVIOR_ORDER.map((behavior) => [
				BEHAVIOR_SUMMARY_LABEL[behavior],
				rows.filter((row) => row.status === behavior).length,
			]),
			emptyLabel: "No changes",
		}),
		stripeIds: [],
	};
};
