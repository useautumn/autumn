/**
 * Smoke test for the s.platform.create DSL + createSubOrgTestContext factory.
 *
 * NOT a TDD test — verifies that the Phase 0 test infrastructure works:
 *  - POST /platform/organizations creates a fresh sub-org under the master.
 *  - The returned ctx points to the sub-org (not master).
 *  - configOverrides are merged into the sub-org's config jsonb.
 *  - taxRegistrations land on the sub-org's Stripe Connect account.
 *
 * If this test fails, every Phase 1 tax test that uses s.platform.create
 * will fail too — this guards the harness itself.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

test(
	`${chalk.yellowBright("platform-suborg-smoke: s.platform.create provisions sub-org with config overrides + AU tax registration")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
			],
			actions: [],
		});

		// 1. Sub-org should be a different org from the master test org.
		expect(ctx.org.id).not.toBe(defaultCtx.org.id);

		// 2. The sub-org's slug should follow the platform router format
		//    `<userSlug>|<masterOrgId>`.
		expect(ctx.org.slug).toContain("|");
		expect(ctx.org.slug.endsWith(`|${defaultCtx.org.id}`)).toBe(true);

		// 3. Config override merged through to the org row.
		expect(ctx.org.config.automatic_tax).toBe(true);

		// 4. AU tax registration was created on the sub-org's Stripe Connect account.
		const registrations = await ctx.stripeCli.tax.registrations.list({
			status: "active",
		});
		const auReg = registrations.data.find((r) => r.country === "AU");
		expect(auReg).toBeDefined();

		// 5. The sub-org's secret key is wired into ctx.orgSecretKey and is a
		//    test-mode key (not the master's, not a live key).
		expect(ctx.orgSecretKey).toMatch(/^am_sk_test/);
		expect(ctx.orgSecretKey).not.toBe(defaultCtx.orgSecretKey);
	},
	120_000, // 2min: platform create + connect account creation + tax registration
);
