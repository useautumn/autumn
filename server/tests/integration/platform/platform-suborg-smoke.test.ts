/**
 * Smoke test guarding the s.platform.create DSL + createSubOrgTestContext.
 * Verifies POST /platform/organizations creates a sub-org, the returned ctx
 * points at it, configOverrides are merged, and taxRegistrations land on the
 * sub-org's Connect account. If this fails, every tax test using
 * s.platform.create will too.
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

		// Sub-org is distinct from master with `<slug>|<masterOrgId>` format.
		expect(ctx.org.id).not.toBe(defaultCtx.org.id);
		expect(ctx.org.slug).toContain("|");
		expect(ctx.org.slug.endsWith(`|${defaultCtx.org.id}`)).toBe(true);

		// Config override merged.
		expect(ctx.org.config.automatic_tax).toBe(true);

		// AU tax registration landed on sub-org's Connect account.
		const registrations = await ctx.stripeCli.tax.registrations.list({
			status: "active",
		});
		const auReg = registrations.data.find((r) => r.country === "AU");
		expect(auReg).toBeDefined();

		// ctx.orgSecretKey is a sub-org test-mode key, not the master's.
		expect(ctx.orgSecretKey).toMatch(/^am_sk_test/);
		expect(ctx.orgSecretKey).not.toBe(defaultCtx.orgSecretKey);
	},
	120_000,
);
