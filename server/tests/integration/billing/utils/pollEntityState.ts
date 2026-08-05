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
 * The Postgres-visibility gates now live in ONE place (`waitForUsageInDb.ts`,
 * customer + entity variants). Re-exported here so the many existing
 * `pollEntityState` import sites keep working.
 */
export { waitForEntityUsageInDb } from "./waitForUsageInDb.js";

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
