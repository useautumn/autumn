import { expect } from "bun:test";
import { type ApiCustomerV3, ApiVersion } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { type PolledEntity, pollEntityUntil } from "./pollEntityState.js";

/**
 * THE one place a test waits for a tracked deduction to be durable in Postgres.
 *
 * `/track` applies the deduction to the Redis balance hash and returns; Postgres
 * is written asynchronously (SyncBatchingManagerV3 batches ~1s → SQS →
 * `syncItemV4`). `syncItemV4` carries only cusEnt ids, so it RE-READS the Redis
 * hash to build the Postgres write — and anything that invalidates the cached
 * full customer in that window (any Stripe webhook for the customer, an attach,
 * a plan change) makes that read miss, at which point the balance write is
 * dropped entirely. The deduction then exists nowhere: Redis was cleared and
 * Postgres never got it, so usage silently reverts to the pre-track value and
 * cycle-end / arrear billing underbills.
 *
 * Everything that bills or resets tracked usage later reads Postgres, never
 * Redis: `invoice.created`'s arrear line items, `customer.subscription.deleted`'s
 * final arrear invoice, a cancel, an upgrade's overage. So gate on a `skip_cache`
 * read (which bypasses Redis and does not write it back) before the next billing
 * action, and the rest of the test is immune to the race instead of racing it —
 * once Postgres holds the value, a cache wipe simply rebuilds the same number.
 *
 * This gate can only DETECT a dropped deduction, never conjure the write. Keep
 * the drop from happening in the first place with `quiesceCustomerWebhooks`
 * (sequence the preceding operation's webhooks BEFORE the track).
 */

/** Same version the `features` map assertions were written against. */
const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

type FeatureRow = { balance?: number | null; usage?: number | null };
type FeatureHolder = { features?: Record<string, FeatureRow | undefined> };

type UsageExpectation = {
	featureId: string;
	/** Post-deduction balance, e.g. `-400` for 400 units of overage. */
	balance?: number;
	usage?: number;
};

const assertUsageInDb = ({
	featureId,
	balance,
	usage,
	scope,
	target,
}: UsageExpectation & {
	/** How the holder is named when the feature is missing entirely. */
	scope: string;
	/** How the holder is named in the "never reached Postgres" messages. */
	target: string;
}) => {
	if (balance === undefined && usage === undefined) {
		throw new Error(
			`waitForUsageInDb needs a balance or a usage to wait for (feature ${featureId})`,
		);
	}

	return (holder: FeatureHolder) => {
		const feature = holder.features?.[featureId];
		expect(
			feature,
			`Feature ${featureId} not found on ${scope} (db read)`,
		).toBeDefined();

		if (balance !== undefined) {
			expect(
				feature?.balance,
				`Tracked deduction for ${featureId} never reached Postgres for ${target}`,
			).toBe(balance);
		}

		if (usage !== undefined) {
			expect(
				feature?.usage,
				`Tracked usage for ${featureId} never reached Postgres for ${target}`,
			).toBe(usage);
		}
	};
};

/** Customer-level variant: polls `customers.get` with `skip_cache`. */
export const waitForCustomerUsageInDb = async ({
	autumn,
	customerId,
	featureId,
	balance,
	usage,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: UsageExpectation & {
	autumn?: AutumnInt;
	customerId: string;
	timeoutMs?: number;
}): Promise<ApiCustomerV3> =>
	pollUntilAsserted({
		fetch: () =>
			(autumn ?? defaultAutumn).customers.get<ApiCustomerV3>(customerId, {
				skip_cache: "true",
			}),
		assert: assertUsageInDb({
			featureId,
			balance,
			usage,
			scope: customerId,
			target: customerId,
		}),
		timeoutMs,
	});

/**
 * Entity-level variant: polls `entities.get` with `skip_cache`.
 *
 * Entity balances only appear on the ENTITY view, so the customer variant cannot
 * substitute for this one.
 */
export const waitForEntityUsageInDb = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	balance,
	usage,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: UsageExpectation & {
	autumn?: AutumnInt;
	customerId: string;
	entityId: string;
	timeoutMs?: number;
}): Promise<PolledEntity> =>
	pollEntityUntil({
		autumn,
		customerId,
		entityId,
		skipCache: true,
		timeoutMs,
		assert: assertUsageInDb({
			featureId,
			balance,
			usage,
			scope: `entity ${entityId}`,
			target: `${customerId}:${entityId}`,
		}),
	});
