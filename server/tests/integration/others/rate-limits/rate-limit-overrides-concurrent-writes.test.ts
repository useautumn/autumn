import { expect, test } from "bun:test";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import chalk from "chalk";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import type { RateLimitOverridesConfig } from "@/internal/misc/rateLimiter/rateLimitOverridesSchemas.js";

const testCase = "rate-limit-overrides-concurrent-writes";
const WRITER_COUNT = 8;

const readServerOverrideKeys = async () => {
	const session = await createDashboardSession(ctx, { superuser: true });
	try {
		const { data } = await dashboardFetch<RateLimitOverridesConfig>(
			ctx,
			session,
			"/admin/rate-limit-overrides-config",
			{ method: "GET" },
		);
		return Object.keys(data.orgs);
	} finally {
		await session.cleanup();
	}
};

test(`${chalk.yellowBright(`${testCase}: parallel writers keep every org key`)}`, async () => {
	const orgKeys = Array.from(
		{ length: WRITER_COUNT },
		() => `rl-concurrent-${crypto.randomUUID()}`,
	);

	const overrides = await Promise.all(
		orgKeys.map((orgKey) =>
			setServerRateLimitOverride({
				ctx,
				orgKey,
				limits: { [RateLimitType.General]: 1 },
			}),
		),
	);
	expect(await readServerOverrideKeys()).toEqual(
		expect.arrayContaining(orgKeys),
	);

	await Promise.all(overrides.map(({ restore }) => restore()));
	const remaining = await readServerOverrideKeys();
	expect(orgKeys.filter((orgKey) => remaining.includes(orgKey))).toEqual([]);
});
