import type { ApiBalanceV1 } from "@autumn/shared";
import type { PreviewBalance, PreviewBalanceChange } from "./types/index.js";

const balanceSubset = (balance: ApiBalanceV1 | undefined): PreviewBalance => ({
	granted: balance?.granted ?? 0,
	remaining: balance?.remaining ?? 0,
	usage: balance?.usage ?? 0,
	unlimited: balance?.unlimited ?? false,
	next_reset_at: balance?.next_reset_at ?? null,
});

const TRACKED_FIELDS: ReadonlyArray<keyof PreviewBalance> = [
	"granted",
	"remaining",
	"usage",
	"unlimited",
	"next_reset_at",
];

const diffPreviousAttributes = ({
	before,
	after,
}: {
	before: PreviewBalance;
	after: PreviewBalance;
}): Record<string, unknown> => {
	const previous: Record<string, unknown> = {};
	for (const field of TRACKED_FIELDS) {
		if (before[field] !== after[field]) {
			previous[field] = before[field];
		}
	}
	return previous;
};

export const buildBalanceChanges = ({
	beforeBalances,
	afterBalances,
}: {
	beforeBalances: Record<string, ApiBalanceV1>;
	afterBalances: Record<string, ApiBalanceV1>;
}): PreviewBalanceChange[] => {
	const featureIds = new Set([
		...Object.keys(beforeBalances),
		...Object.keys(afterBalances),
	]);

	return Array.from(featureIds).flatMap((featureId) => {
		const after = afterBalances[featureId];
		// Feature disappeared post-migration → flag_changes / plan_changes own
		// that signal; we don't emit a balance_change carrying nothing.
		if (!after) return [];

		const before = balanceSubset(beforeBalances[featureId]);
		const balance = balanceSubset(after);
		const previous_attributes = diffPreviousAttributes({
			before,
			after: balance,
		});

		if (Object.keys(previous_attributes).length === 0) return [];

		return [
			{
				feature_id: featureId,
				balance,
				previous_attributes,
			},
		];
	});
};
