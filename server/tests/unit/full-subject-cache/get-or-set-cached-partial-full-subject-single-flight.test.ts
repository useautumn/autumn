/**
 * TDD coverage for coalescing concurrent partial FullSubject cache misses.
 *
 * Red-failure mode (current behavior):
 *  - Identical concurrent check reads each start their own DB hydration.
 *
 * Green-success criteria (after fix):
 *  - One request hydrates while identical in-process readers await its result.
 *  - Different feature sets and Redis instances remain isolated.
 *  - A rejected hydration is removed so the next request can retry.
 */

import { expect, mock, test } from "bun:test";
import { AppEnv, type FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const hydrationCounts = new Map<string, number>();
const failuresRemaining = new Map<string, number>();
const subjectViewEpochs = new Map<string, number>();

const buildFullSubject = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId?: string;
}): FullSubject =>
	({
		customer: {
			id: customerId,
			internal_id: `internal-${customerId}`,
		},
		entityId,
		customer_products: [],
		extra_customer_entitlements: [],
		pooled_customer_entitlements: [],
	}) as unknown as FullSubject;

mock.module(
	"@/internal/customers/cache/fullSubject/actions/partial/getCachedPartialFullSubject.js",
	() => ({
		getCachedPartialFullSubject: async ({
			customerId,
		}: {
			customerId: string;
		}) => ({
			fullSubject: undefined,
			subjectViewEpoch: subjectViewEpochs.get(customerId) ?? 0,
		}),
	}),
);

mock.module("@/internal/customers/repos/getFullSubject/index.js", () => ({
	getFullSubjectNormalized: async ({
		customerId,
		entityId,
	}: {
		customerId: string;
		entityId?: string;
	}) => {
		hydrationCounts.set(customerId, (hydrationCounts.get(customerId) ?? 0) + 1);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const remainingFailures = failuresRemaining.get(customerId) ?? 0;
		if (remainingFailures > 0) {
			failuresRemaining.set(customerId, remainingFailures - 1);
			throw new Error(`hydrate failed for ${customerId}`);
		}

		return {
			normalized: {
				customerId,
				entityId,
				customer_entitlements: [],
			},
			fullSubject: buildFullSubject({ customerId, entityId }),
		};
	},
}));

mock.module(
	"@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js",
	() => ({
		setCachedFullSubject: async () => {},
	}),
);

mock.module(
	"@/internal/customers/cache/fullSubject/actions/rehydrateWithLiveBalances.js",
	() => ({
		rehydrateWithLiveBalances: async () => undefined,
	}),
);

const { getOrSetCachedPartialFullSubject } = await import(
	"@/internal/customers/cache/fullSubject/actions/partial/getOrSetCachedPartialFullSubject.js"
);

const buildContext = ({
	redisV2,
	orgId = "org-single-flight",
	skipCache = false,
}: {
	redisV2: object;
	orgId?: string;
	skipCache?: boolean;
}): AutumnContext =>
	({
		org: { id: orgId },
		env: AppEnv.Live,
		redisV2,
		skipCache,
		logger: {
			debug: () => {},
		},
	}) as unknown as AutumnContext;

test.concurrent(
	"partial FullSubject cache miss: identical concurrent reads hydrate once",
	async () => {
		const customerId = "single-flight-identical";
		const ctx = buildContext({ redisV2: {} });

		const results = await Promise.all(
			Array.from({ length: 10 }, () =>
				getOrSetCachedPartialFullSubject({
					ctx,
					customerId,
					featureIds: ["messages"],
					source: "single-flight-test",
				}),
			),
		);

		expect(hydrationCounts.get(customerId)).toBe(1);
		expect(
			results.every((fullSubject) => fullSubject.customer.id === customerId),
		).toBe(true);
	},
);

test.concurrent(
	"partial FullSubject cache miss: equivalent feature sets share a hydration",
	async () => {
		const customerId = "single-flight-canonical-feature-set";
		const ctx = buildContext({ redisV2: {} });

		await Promise.all([
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["messages", "credits", "messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["credits", "messages"],
			}),
		]);

		expect(hydrationCounts.get(customerId)).toBe(1);
	},
);

test.concurrent(
	"partial FullSubject cache miss: different feature sets do not share results",
	async () => {
		const customerId = "single-flight-feature-isolation";
		const ctx = buildContext({ redisV2: {} });

		await Promise.all([
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["credits"],
			}),
		]);

		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);

test.concurrent(
	"partial FullSubject cache miss: different entities do not share results",
	async () => {
		const customerId = "single-flight-entity-isolation";
		const ctx = buildContext({ redisV2: {} });

		await Promise.all([
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				entityId: "entity-a",
				featureIds: ["messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				entityId: "entity-b",
				featureIds: ["messages"],
			}),
		]);

		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);

test.concurrent(
	"partial FullSubject cache miss: different orgs do not share results",
	async () => {
		const customerId = "single-flight-org-isolation";
		const redisV2 = {};
		const firstContext = buildContext({ redisV2, orgId: "org-a" });
		const secondContext = buildContext({ redisV2, orgId: "org-b" });

		await Promise.all([
			getOrSetCachedPartialFullSubject({
				ctx: firstContext,
				customerId,
				featureIds: ["messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx: secondContext,
				customerId,
				featureIds: ["messages"],
			}),
		]);

		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);

test.concurrent(
	"partial FullSubject cache miss: different Redis instances do not share results",
	async () => {
		const customerId = "single-flight-redis-isolation";
		const firstContext = buildContext({ redisV2: {} });
		const secondContext = buildContext({ redisV2: {} });

		await Promise.all([
			getOrSetCachedPartialFullSubject({
				ctx: firstContext,
				customerId,
				featureIds: ["messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx: secondContext,
				customerId,
				featureIds: ["messages"],
			}),
		]);

		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);

test.concurrent(
	"partial FullSubject cache miss: a newer view epoch does not join stale hydration",
	async () => {
		const customerId = "single-flight-epoch-isolation";
		const ctx = buildContext({ redisV2: {} });
		subjectViewEpochs.set(customerId, 1);

		const firstHydration = getOrSetCachedPartialFullSubject({
			ctx,
			customerId,
			featureIds: ["messages"],
		});
		await Promise.resolve();

		subjectViewEpochs.set(customerId, 2);
		const secondHydration = getOrSetCachedPartialFullSubject({
			ctx,
			customerId,
			featureIds: ["messages"],
		});

		await Promise.all([firstHydration, secondHydration]);
		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);

test.concurrent(
	"partial FullSubject cache miss: skipCache requests never share hydration",
	async () => {
		const customerId = "single-flight-skip-cache";
		const ctx = buildContext({ redisV2: {}, skipCache: true });

		await Promise.all([
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["messages"],
			}),
		]);

		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);

test.concurrent(
	"partial FullSubject cache miss: rejected flights are cleared for retry",
	async () => {
		const customerId = "single-flight-retry";
		const ctx = buildContext({ redisV2: {} });
		failuresRemaining.set(customerId, 1);

		const firstWave = await Promise.allSettled([
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["messages"],
			}),
			getOrSetCachedPartialFullSubject({
				ctx,
				customerId,
				featureIds: ["messages"],
			}),
		]);

		expect(firstWave.every((result) => result.status === "rejected")).toBe(
			true,
		);

		const retry = await getOrSetCachedPartialFullSubject({
			ctx,
			customerId,
			featureIds: ["messages"],
		});

		expect(retry.customer.id).toBe(customerId);
		expect(hydrationCounts.get(customerId)).toBe(2);
	},
);
