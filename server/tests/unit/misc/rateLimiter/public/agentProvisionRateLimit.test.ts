import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

const realEdgeConfigRegistry = {
	...(await import("@/internal/misc/edgeConfig/edgeConfigRegistry.js")),
};

mock.module("@/internal/misc/edgeConfig/edgeConfigRegistry.js", () => ({
	registerEdgeConfig: () => undefined,
}));

import { AgentProvisionRateLimitConfigSchema } from "@/internal/misc/rateLimiter/public/agentProvisionRateLimit/agentProvisionRateLimitSchemas.js";
import { _setAgentProvisionRateLimitForTesting } from "@/internal/misc/rateLimiter/public/agentProvisionRateLimit/agentProvisionRateLimitStore.js";
import {
	PUBLIC_RATE_LIMIT_CONFIGS,
	PublicRateLimitType,
	resolvePublicRateLimit,
} from "@/internal/misc/rateLimiter/public/publicRateLimitConfigs.js";

const reset = () => {
	_setAgentProvisionRateLimitForTesting({ config: {} });
};

describe("agent provision rate limit edge config", () => {
	afterEach(reset);

	test("falls back to the code defaults", () => {
		reset();

		expect(
			resolvePublicRateLimit({
				type: PublicRateLimitType.AgentProvisionGlobal,
			}).limit,
		).toBe(
			PUBLIC_RATE_LIMIT_CONFIGS[PublicRateLimitType.AgentProvisionGlobal].limit,
		);
		expect(
			resolvePublicRateLimit({
				type: PublicRateLimitType.AgentProvisionClient,
			}).limit,
		).toBe(
			PUBLIC_RATE_LIMIT_CONFIGS[PublicRateLimitType.AgentProvisionClient].limit,
		);
	});

	test("overrides the global and per-IP hourly limits independently", () => {
		_setAgentProvisionRateLimitForTesting({
			config: {
				globalRequestsPerHour: 250,
				requestsPerIpPerHour: 12,
			},
		});

		expect(
			resolvePublicRateLimit({
				type: PublicRateLimitType.AgentProvisionGlobal,
			}).limit,
		).toBe(250);
		expect(
			resolvePublicRateLimit({
				type: PublicRateLimitType.AgentProvisionClient,
			}).limit,
		).toBe(12);
		expect(
			resolvePublicRateLimit({
				type: PublicRateLimitType.AgentProvisionClient,
			}).windowMs,
		).toBe(60 * 60 * 1000);
		expect(
			resolvePublicRateLimit({ type: PublicRateLimitType.AgentClaim }).limit,
		).toBe(PUBLIC_RATE_LIMIT_CONFIGS[PublicRateLimitType.AgentClaim].limit);
	});

	test("rejects negative and fractional limits", () => {
		expect(
			AgentProvisionRateLimitConfigSchema.safeParse({
				globalRequestsPerHour: -1,
			}).success,
		).toBe(false);
		expect(
			AgentProvisionRateLimitConfigSchema.safeParse({
				requestsPerIpPerHour: 1.5,
			}).success,
		).toBe(false);
	});
});

afterAll(() => {
	mock.module(
		"@/internal/misc/edgeConfig/edgeConfigRegistry.js",
		() => realEdgeConfigRegistry,
	);
	mock.restore();
});
