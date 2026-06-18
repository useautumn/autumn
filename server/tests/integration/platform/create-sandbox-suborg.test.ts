import { afterAll, expect, test } from "bun:test";
import { type Organization, organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";

const { db } = initDrizzle();
let createdOrgId: string | undefined;

afterAll(async () => {
	if (!createdOrgId) return;
	const org = (await db.query.organizations.findFirst({
		where: eq(organizations.id, createdOrgId),
	})) as Organization | undefined;
	if (org) {
		await deletePlatformSubOrg({ db, org, logger, skipLiveCustomerCheck: true });
	}
});

test(`${chalk.yellowBright("create-sandbox: s.platform.create({ isSandbox }) marks config.is_sandbox + created_by=master + own key")}`, async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ isSandbox: true })],
		actions: [],
	});
	createdOrgId = ctx.org.id;

	expect(ctx.org.created_by).toBe(defaultCtx.org.id);
	expect(ctx.org.is_sandbox).toBe(true);
	expect(ctx.org.id).not.toBe(defaultCtx.org.id);
	expect(ctx.orgSecretKey).toMatch(/^am_sk_test/);
	expect(ctx.orgSecretKey).not.toBe(defaultCtx.orgSecretKey);
}, 120_000);
