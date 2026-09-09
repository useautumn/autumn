import {
	type ApiCustomerV5,
	type ApiUsageLimit,
	type CustomerBillingControls,
	type DbUsageLimit,
	ResetInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import {
	expectUsageLimitAbsent,
	expectUsageLimitCorrect,
} from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";

/**
 * Arms a windowed hard usage cap via the customer's `usage_limits` billing
 * control; `interval` sets the window.
 */
export const setCustomerUsageLimit = async ({
	autumn,
	customerId,
	featureId,
	limit,
	interval = ResetInterval.Month,
	anchor,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	limit: number;
	interval?: DbUsageLimit["interval"];
	anchor?: DbUsageLimit["anchor"];
}) => {
	const billingControls: CustomerBillingControls = {
		usage_limits: [
			{
				feature_id: featureId,
				enabled: true,
				limit,
				interval,
				...(anchor && { anchor }),
			},
		],
	};

	await timeout(2000);
	await autumn.customers.updateRpc(customerId, {
		billing_controls: billingControls,
	});
	await timeout(3000);
};

/** Fetches the customer (cached read) and asserts a feature balance. */
export const expectCustomerBalance = async ({
	autumn,
	customerId,
	featureId,
	granted,
	remaining,
	usage,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	granted?: number;
	remaining?: number;
	usage?: number;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({ customer, featureId, granted, remaining, usage });
};

/**
 * Fetches the customer and asserts the usage_limits entry's current window
 * `usage` (and optionally the configured limit). `skipCache` reads through to
 * Postgres, verifying the synced counter rather than the Redis one. Polls until
 * the assertion holds, since counters sync from Redis lazily.
 */
export const expectCustomerUsageLimit = async ({
	autumn,
	customerId,
	featureId,
	usage,
	limit,
	source,
	filterProperties,
	skipCache = false,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	usage?: number;
	limit?: number;
	source?: ApiUsageLimit["source"];
	filterProperties?: Record<string, string> | null;
	skipCache?: boolean;
}) => {
	await pollUntilAsserted({
		fetch: () =>
			autumn.customers.get<ApiCustomerV5>(
				customerId,
				skipCache ? { skip_cache: "true" } : undefined,
			),
		assert: (customer) =>
			expectUsageLimitCorrect({
				customer,
				featureId,
				usage,
				limit,
				source,
				filterProperties,
			}),
	});
};

/** Fetches the customer through to Postgres and asserts the feature has no usage_limits entry. */
export const expectCustomerUsageLimitAbsent = async ({
	autumn,
	customerId,
	featureId,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectUsageLimitAbsent({ customer, featureId });
};
