import { describe, expect, test } from "bun:test";
import { AutoTopupSchema, OrgConfigSchema } from "@autumn/shared";
import {
	DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
	getAutoTopupRateLimitConfigs,
} from "@/internal/balances/autoTopUp/helpers/limits/autoTopupRateLimitConfigs";

const autoTopupConfig = AutoTopupSchema.parse({
	feature_id: "credits",
	threshold: 10,
	quantity: 100,
});

describe("getAutoTopupRateLimitConfigs", () => {
	test("uses the default attempt limit when the org sets none", () => {
		const { attemptLimit } = getAutoTopupRateLimitConfigs({
			autoTopupConfig,
			orgConfig: OrgConfigSchema.parse({}),
		});

		expect(attemptLimit).toEqual(DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT);
	});

	test("uses the org attempt limit within the default window", () => {
		const { attemptLimit } = getAutoTopupRateLimitConfigs({
			autoTopupConfig,
			orgConfig: OrgConfigSchema.parse({ auto_topup_attempt_limit: 10 }),
		});

		expect(attemptLimit).toEqual({
			...DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
			limit: 10,
		});
	});
});
