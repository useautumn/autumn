import { expect } from "bun:test";
import {
	type ApiCusFeatureV3,
	type ApiCusProductV3,
	type ApiEntityV0,
	ApiVersion,
} from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Same version the entity `features` map assertions were written against. */
const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

/** Entity shape `entities.get` returns by default (features + products maps). */
export type PolledEntity = ApiEntityV0 & {
	features: Record<string, ApiCusFeatureV3>;
	products: ApiCusProductV3[];
};

/**
 * Entity-scoped sibling of `pollableCustomerExpect`: re-fetches the entity
 * until `assert` stops throwing.
 *
 * `pollableCustomerExpect`-backed helpers re-fetch through `customers.get`, so
 * they cannot be used for state that only appears on the ENTITY view (a product
 * attached to an entity, an entity's own balances/invoices). Post-boundary
 * entity state is webhook-driven — `invoice.created` bills the arrear line
 * items, resets the cusEnt balances and only then upserts the Autumn invoice —
 * so a single read taken right after a clock advance is a race.
 *
 * The ceiling stays at `DEFAULT_SETTLE_TIMEOUT_MS`: the advance itself already
 * waited for the boundary invoice, so this only covers the last hop — and an
 * assertion that can never hold (a lost write) must surface fast rather than
 * burn the file's wall time.
 */
export const pollEntityUntil = async ({
	autumn,
	customerId,
	entityId,
	assert,
	skipCache = false,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	autumn?: AutumnInt;
	customerId: string;
	entityId: string;
	assert: (entity: PolledEntity) => unknown | Promise<unknown>;
	/** Read past the cache, i.e. assert on what Postgres actually holds. */
	skipCache?: boolean;
	timeoutMs?: number;
}): Promise<PolledEntity> =>
	pollUntilAsserted({
		fetch: () =>
			(autumn ?? defaultAutumn).entities.get<PolledEntity>(
				customerId,
				entityId,
				skipCache ? { skip_cache: "true" } : undefined,
			),
		assert,
		timeoutMs,
	});

/**
 * Entity-scoped sibling of `waitForTrackedUsageInDb`.
 *
 * A `/track` deduction is applied to the Redis balance immediately and reaches
 * Postgres only when its async sync runs. Everything that bills or resets that
 * usage later — `invoice.created`'s arrear line items, `customer.subscription
 * .deleted`'s final arrear invoice, a cancel — reads Postgres, and any
 * full-subject invalidation landing in that window (a Stripe webhook from the
 * attach that preceded the track) drops the cached deduction. Gating on the
 * Postgres-backed read makes the rest of the test immune to that race instead
 * of racing it.
 */
export const waitForEntityUsageInDb = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	balance,
	usage,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	autumn?: AutumnInt;
	customerId: string;
	entityId: string;
	featureId: string;
	balance?: number;
	usage?: number;
	timeoutMs?: number;
}): Promise<PolledEntity> =>
	pollEntityUntil({
		autumn,
		customerId,
		entityId,
		skipCache: true,
		timeoutMs,
		assert: (entity) => {
			const feature = entity.features?.[featureId];
			expect(
				feature,
				`Feature ${featureId} not found on entity ${entityId} (db read)`,
			).toBeDefined();

			if (balance !== undefined) {
				expect(
					feature?.balance,
					`Tracked deduction for ${featureId} never reached Postgres for ${customerId}:${entityId}`,
				).toBe(balance);
			}

			if (usage !== undefined) {
				expect(
					feature?.usage,
					`Tracked usage for ${featureId} never reached Postgres for ${customerId}:${entityId}`,
				).toBe(usage);
			}
		},
	});

/**
 * Retries an assertion block that fetches its own state (helpers like
 * `expectInvoiceAfterUsage`, which take no `customerId` polling hook).
 */
export const pollAssertion = async ({
	assert,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	assert: () => unknown | Promise<unknown>;
	timeoutMs?: number;
}): Promise<void> => {
	await pollUntilAsserted({
		fetch: async () => undefined,
		assert: () => assert(),
		timeoutMs,
	});
};
