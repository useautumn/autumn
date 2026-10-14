import type {
	SetPlansPreviewBalance,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import type { AttributedBalance } from "@/internal/billing/v2/pooledBalances/attribution/attributePooledBalances";

export type PhaseBalances = Record<string, AttributedBalance>;

export type PhaseBalanceDiff = Pick<
	SetPlansPreviewBalanceChange,
	"feature_id" | "balance" | "previous_attributes" | "behavior"
>;

type BalanceBehavior = SetPlansPreviewBalanceChange["behavior"];

type BalanceTransition = {
	before: SetPlansPreviewBalance;
	after: SetPlansPreviewBalance;
};

const TRACKED_FIELDS = [
	"granted",
	"remaining",
	"usage",
	"unlimited",
	"next_reset_at",
	"overage_allowed",
] as const satisfies ReadonlyArray<keyof SetPlansPreviewBalance>;

const toPreviewBalance = (
	balance: AttributedBalance | undefined,
): SetPlansPreviewBalance => ({
	granted: balance?.granted ?? 0,
	remaining: balance?.remaining ?? 0,
	usage: balance?.usage ?? 0,
	unlimited: balance?.unlimited ?? false,
	next_reset_at: balance?.next_reset_at ?? null,
	overage_allowed: balance?.overage_allowed ?? false,
});

const grantsAccess = (balance: SetPlansPreviewBalance) =>
	balance.unlimited || balance.granted > 0 || balance.overage_allowed;

const holdsNothing = ({ before, after }: BalanceTransition) =>
	!grantsAccess(before) &&
	!grantsAccess(after) &&
	before.usage === 0 &&
	after.usage === 0;

const gainsAccess = ({ before, after }: BalanceTransition) =>
	!grantsAccess(before) && grantsAccess(after);

const losesAccess = ({ before, after }: BalanceTransition) =>
	grantsAccess(before) && !grantsAccess(after);

const clearsUsage = ({ before, after }: BalanceTransition) =>
	before.usage > 0 && after.usage === 0;

const keepsUsage = ({ before, after }: BalanceTransition) =>
	after.usage > 0 && after.usage === before.usage;

const keepsAllowance = ({ before, after }: BalanceTransition) =>
	before.granted === after.granted && before.unlimited === after.unlimited;

const resetsAllowance = (transition: BalanceTransition) =>
	clearsUsage(transition) && keepsAllowance(transition);

const keepsRemaining = ({ before, after }: BalanceTransition) =>
	clearsUsage({ before, after }) &&
	!after.unlimited &&
	after.remaining === before.remaining;

const BEHAVIOR_TABLE: ReadonlyArray<
	[BalanceBehavior, (transition: BalanceTransition) => boolean]
> = [
	["added", gainsAccess],
	["removed", losesAccess],
	["carried", keepsRemaining],
	["reset", resetsAllowance],
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

export const diffPhaseBalances = ({
	before,
	after,
}: {
	before: PhaseBalances;
	after: PhaseBalances;
}): PhaseBalanceDiff[] => {
	const featureIds = new Set([...Object.keys(after), ...Object.keys(before)]);

	return [...featureIds].flatMap((featureId) => {
		const transition = {
			before: toPreviewBalance(before[featureId]),
			after: toPreviewBalance(after[featureId]),
		};
		const previousAttributes = changedPreviousAttributes(transition);
		if (Object.keys(previousAttributes).length === 0) return [];
		if (holdsNothing(transition)) return [];

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
