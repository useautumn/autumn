import type { ApiBalanceV1 } from "@autumn/shared";
import type { PreviewBalanceChange } from "./types/index.js";

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
		const before = beforeBalances[featureId];
		const after = afterBalances[featureId];
		const beforeSnapshot = {
			granted: before?.granted ?? 0,
			remaining: before?.remaining ?? 0,
			usage: before?.usage ?? 0,
		};
		const afterSnapshot = {
			granted: after?.granted ?? 0,
			remaining: after?.remaining ?? 0,
			usage: after?.usage ?? 0,
		};

		if (
			beforeSnapshot.granted === afterSnapshot.granted &&
			beforeSnapshot.remaining === afterSnapshot.remaining &&
			beforeSnapshot.usage === afterSnapshot.usage
		)
			return [];

		return [
			{
				feature_id: featureId,
				...afterSnapshot,
				before: beforeSnapshot,
			},
		];
	});
};
