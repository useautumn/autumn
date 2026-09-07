/**
 * Regression: PATCH /organization/config must merge, not replace. A prior
 * `OrgConfigSchema.partial()` body schema filled every field's default, so each
 * save overwrote previously-set flags. These tests drive the real HTTP handler.
 */

import { expect, test } from "bun:test";
import {
	type DbUsageAlert,
	type OrgConfig,
	OrgConfigSchema,
	organizations,
} from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

test("org config handler: overdue flags stay inverted across old and new writes", async () => {
	const { ctx } = await initScenario({ setup: [], actions: [] });
	const { db, org } = ctx;
	const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });
	const cases: [Partial<OrgConfig>, boolean][] = [
		[{ include_past_due: false }, true],
		[{ include_past_due: true }, false],
		[{ block_overdue_entitlements: true }, true],
		[{ automatic_tax: true }, true],
		[{ block_overdue_entitlements: false }, false],
		[{ block_overdue_entitlements: true, include_past_due: true }, true],
	];

	try {
		for (const [updates, blocked] of cases) {
			if (updates.automatic_tax !== undefined) {
				await autumn.patch("/organization/config", {
					block_overdue_entitlements: blocked,
				});
			}
			const response = (await autumn.patch(
				"/organization/config",
				updates,
			)) as {
				config: OrgConfig;
			};
			const [persisted] = await db
				.select({ config: organizations.config })
				.from(organizations)
				.where(eq(organizations.id, org.id));
			for (const config of [response.config, persisted?.config]) {
				expect(config).toMatchObject({
					block_overdue_entitlements: blocked,
					include_past_due: !blocked,
				});
			}
		}
	} finally {
		await db
			.update(organizations)
			.set({ config: org.config })
			.where(eq(organizations.id, org.id));
		await clearOrgCache({ db, orgId: org.id });
	}
});

test(`${chalk.yellowBright("org config handler: second save preserves first save")}`, async () => {
	const { ctx } = await initScenario({ setup: [], actions: [] });
	const { db, org } = ctx;
	const originalConfig = org.config;

	const readDbConfig = async (): Promise<OrgConfig> => {
		const [row] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);
		return OrgConfigSchema.parse(row?.config ?? {});
	};

	try {
		// Known empty starting state.
		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });

		// First save: one toggle.
		const firstResponse = (await autumn.patch("/organization/config", {
			automatic_tax: true,
		})) as { success: boolean; config: OrgConfig };
		expect(firstResponse.config.automatic_tax).toBe(true);

		// Second save: a different toggle.
		const secondResponse = (await autumn.patch("/organization/config", {
			cancel_on_past_due: true,
		})) as { success: boolean; config: OrgConfig };

		// The regression assertions: the first field must survive the second save.
		expect(secondResponse.config.automatic_tax).toBe(true);
		expect(secondResponse.config.cancel_on_past_due).toBe(true);

		const persisted = await readDbConfig();
		expect(persisted.automatic_tax).toBe(true);
		expect(persisted.cancel_on_past_due).toBe(true);
	} finally {
		await db
			.update(organizations)
			.set({ config: originalConfig })
			.where(eq(organizations.id, org.id));
	}
});

/**
 * Guards the mixed-type path: `usage_alerts` (an array) is saved through the
 * same endpoint and must coexist with previously-set boolean flags.
 */
test(`${chalk.yellowBright("org config handler: array field (usage_alerts) merges with boolean flags")}`, async () => {
	const { ctx } = await initScenario({ setup: [], actions: [] });
	const { db, org } = ctx;
	const originalConfig = org.config;

	const readDbConfig = async (): Promise<OrgConfig> => {
		const [row] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);
		return OrgConfigSchema.parse(row?.config ?? {});
	};

	const alert: DbUsageAlert = {
		enabled: true,
		threshold: 80,
		threshold_type: "usage_percentage",
		basis: "balance",
	};

	try {
		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });

		// Boolean toggle first.
		await autumn.patch("/organization/config", { automatic_tax: true });

		// Then an array field through the same endpoint.
		const response = (await autumn.patch("/organization/config", {
			usage_alerts: [alert],
		})) as { success: boolean; config: OrgConfig };

		expect(response.config.automatic_tax).toBe(true);
		expect(response.config.usage_alerts).toHaveLength(1);
		expect(response.config.usage_alerts?.[0]?.threshold).toBe(80);

		const persisted = await readDbConfig();
		expect(persisted.automatic_tax).toBe(true);
		expect(persisted.usage_alerts).toHaveLength(1);
	} finally {
		await db
			.update(organizations)
			.set({ config: originalConfig })
			.where(eq(organizations.id, org.id));
	}
});

test(`${chalk.yellowBright("org config handler: disable_overage_billing saves and preserves other fields")}`, async () => {
	const { ctx } = await initScenario({ setup: [], actions: [] });
	const { db, org } = ctx;
	const originalConfig = org.config;

	const readDbConfig = async (): Promise<OrgConfig> => {
		const [row] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);
		return OrgConfigSchema.parse(row?.config ?? {});
	};

	try {
		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });

		await autumn.patch("/organization/config", { automatic_tax: true });
		const response = (await autumn.patch("/organization/config", {
			disable_overage_billing: true,
		})) as { success: boolean; config: OrgConfig };

		expect(response.config.disable_overage_billing).toBe(true);
		expect(response.config.automatic_tax).toBe(true);

		const persisted = await readDbConfig();
		expect(persisted.disable_overage_billing).toBe(true);
		expect(persisted.automatic_tax).toBe(true);
	} finally {
		await db
			.update(organizations)
			.set({ config: originalConfig })
			.where(eq(organizations.id, org.id));
	}
});
