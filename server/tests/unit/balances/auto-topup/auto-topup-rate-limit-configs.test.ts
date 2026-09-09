import { describe, expect, test } from "bun:test";
import { AutoTopupSchema } from "@autumn/shared";
import {
	DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
	getAutoTopupRateLimitConfigs,
} from "@/internal/balances/autoTopUp/helpers/limits/autoTopupRateLimitConfigs";
import { _setRateLimitOverridesConfigForTesting } from "@/internal/misc/rateLimiter/rateLimitOverridesStore";

const autoTopupConfig = AutoTopupSchema.parse({
	feature_id: "credits",
	threshold: 10,
	quantity: 100,
});
const org = { id: "org_limited", slug: "limited" };

describe("getAutoTopupRateLimitConfigs", () => {
	test("uses the default attempt limit when the org has no override", () => {
		_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });

		const { attemptLimit } = getAutoTopupRateLimitConfigs({
			autoTopupConfig,
			org,
		});

		expect(attemptLimit).toEqual(DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT);
	});

	test("uses the org limits override within the default window", () => {
		_setRateLimitOverridesConfigForTesting({
			config: { orgs: { [org.id]: { limits: { auto_topup_attempts: 10 } } } },
		});

		const { attemptLimit } = getAutoTopupRateLimitConfigs({
			autoTopupConfig,
			org,
		});

		expect(attemptLimit).toEqual({
			...DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
			limit: 10,
		});
	});
});
