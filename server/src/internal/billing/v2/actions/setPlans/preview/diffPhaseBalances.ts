import type {
	ApiBalanceV1,
	PreviewBalance,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";

export type PhaseBalances = Record<string, ApiBalanceV1>;

type BalanceBehavior = SetPlansPreviewBalanceChange["behavior"];

type BalanceTransition = { before: PreviewBalance; after: PreviewBalance };

const TRACKED_FIELDS = [
	"granted",
	"remaining",
	"usage",
	"unlimited",
	"next_reset_at",
] as const satisfies ReadonlyArray<keyof PreviewBalance>;

/** A feature missing from a phase reads as an empty balance, so gaining or losing it diffs like any other change. */
const toPreviewBalance = (
	balance: ApiBalanceV1 | undefined,
): PreviewBalance => ({
	granted: balance?.granted ?? 0,
	remaining: balance?.remaining ?? 0,
	usage: balance?.usage ?? 0,
	unlimited: balance?.unlimited ?? false,
	next_reset_at: balance?.next_reset_at ?? null,
});

const grantsAccess = (balance: PreviewBalance) =>
	balance.unlimited || balance.granted > 0;

const gainsAccess = ({ before, after }: BalanceTransition) =>
	!grantsAccess(before) && grantsAccess(after);

const losesAccess = ({ before, after }: BalanceTransition) =>
	grantsAccess(before) && !grantsAccess(after);

const clearsUsage = ({ before, after }: BalanceTransition) =>
	before.usage > 0 && after.usage === 0;

const keepsUsage = ({ before, after }: BalanceTransition) =>
	after.usage > 0 && after.usage === before.usage;

/** First matching row wins: access changes outrank usage changes, which outrank a plain update. */
const BEHAVIOR_TABLE: ReadonlyArray<
	[BalanceBehavior, (transition: BalanceTransition) => boolean]
> = [
	["added", gainsAccess],
	["removed", losesAccess],
	["reset", clearsUsage],
	["carried", keepsUsage],
	["updated", () => true],
];

const balanceBehavior = (transition: BalanceTransition): BalanceBehavior =>
	BEHAVIOR_TABLE.find(([, matches]) => matches(transition))?.[0] ?? "updated";

const changedPreviousAttributes = ({ before, after }: BalanceTransition) =>
	Object.fromEntries(
		TRACKED_FIELDS.filter((field) => before[field] !== after[field]).map(
			(field) => [field, before[field]],
		),
	);

/** Each feature whose balance differs between two phases, classified by how it changes. */
export const diffPhaseBalances = ({
	before,
	after,
}: {
	before: PhaseBalances;
	after: PhaseBalances;
}): SetPlansPreviewBalanceChange[] => {
	const featureIds = new Set([...Object.keys(after), ...Object.keys(before)]);

	return [...featureIds].flatMap((featureId) => {
		const transition = {
			before: toPreviewBalance(before[featureId]),
			after: toPreviewBalance(after[featureId]),
		};
		const previousAttributes = changedPreviousAttributes(transition);
		if (Object.keys(previousAttributes).length === 0) return [];

		return [
			{
				feature_id: featureId,
				balance: transition.after,
				previous_attributes: previousAttributes,
				behavior: balanceBehavior(transition),
			},
		];
	});
};
