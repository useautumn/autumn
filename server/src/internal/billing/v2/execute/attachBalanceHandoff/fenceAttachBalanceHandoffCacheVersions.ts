import type { NormalizedFullSubject } from "@autumn/shared";

const currentCacheVersion = ({
	cacheVersion,
}: {
	cacheVersion: number | null;
}): number => cacheVersion ?? 0;

/**
 * Gives every balance participating in the handoff a newer database fence.
 * The result is deterministic for the same source/target snapshots, so a
 * Redis compare-and-switch retry rewrites the same versions instead of
 * incrementing them repeatedly.
 */
export const fenceAttachBalanceHandoffCacheVersions = ({
	source,
	target,
}: {
	source: NormalizedFullSubject;
	target: NormalizedFullSubject;
}): {
	source: NormalizedFullSubject;
	target: NormalizedFullSubject;
	allowedCacheVersionsById: Map<string, number[]>;
} => {
	const cacheVersionsById = new Map<string, Set<number>>();
	for (const subjectBalance of [
		...source.customer_entitlements,
		...target.customer_entitlements,
	]) {
		const cacheVersion = currentCacheVersion({
			cacheVersion: subjectBalance.cache_version,
		});
		const versions = cacheVersionsById.get(subjectBalance.id) ?? new Set();
		versions.add(cacheVersion);
		cacheVersionsById.set(subjectBalance.id, versions);
	}
	const fencedVersionById = new Map(
		[...cacheVersionsById].map(([id, versions]) => [
			id,
			Math.max(...versions) + 1,
		]),
	);
	const fencedUsageWindowTimestampById = new Map<string, number>();
	for (const usageWindow of [
		...source.usage_windows,
		...target.usage_windows,
	]) {
		fencedUsageWindowTimestampById.set(
			usageWindow.id,
			Math.max(
				fencedUsageWindowTimestampById.get(usageWindow.id) ?? 0,
				usageWindow.updated_at + 1,
			),
		);
	}

	const applyFence = ({
		normalized,
	}: {
		normalized: NormalizedFullSubject;
	}): NormalizedFullSubject => ({
		...structuredClone(normalized),
		customer_entitlements: normalized.customer_entitlements.map(
			(subjectBalance) => ({
				...structuredClone(subjectBalance),
				cache_version: fencedVersionById.get(subjectBalance.id) ?? 1,
			}),
		),
		usage_windows: normalized.usage_windows.map((usageWindow) => ({
			...structuredClone(usageWindow),
			updated_at:
				fencedUsageWindowTimestampById.get(usageWindow.id) ??
				usageWindow.updated_at,
		})),
	});

	return {
		source: applyFence({ normalized: source }),
		target: applyFence({ normalized: target }),
		allowedCacheVersionsById: new Map(
			[...cacheVersionsById].map(([id, versions]) => [
				id,
				[...versions, fencedVersionById.get(id) ?? 1].sort((a, b) => a - b),
			]),
		),
	};
};
