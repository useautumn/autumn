import { afterAll, describe, expect, test } from "bun:test";
import { AppEnv, organizations, type Organization } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { User } from "better-auth";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";
import { encryptData } from "@/utils/encryptUtils.js";

const { db } = initDrizzle();
const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;

let createdOrg: Organization | undefined;

afterAll(async () => {
	if (createdOrg) {
		await deletePlatformSubOrg({
			db,
			org: createdOrg,
			logger,
			skipLiveCustomerCheck: true,
		});
	}
});

const fetchOrg = async (orgId: string): Promise<Organization> => {
	const [row] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.id, orgId));
	return row as Organization;
};

describe("sandbox sub-org: Stripe secret-key disconnect", () => {
	test(
		`${chalk.yellowBright("sandbox stripe: disconnecting a sub-org's secret key clears it on that sub-org")}`,
		async () => {
			const actorUser = (await db.query.user.findFirst()) as unknown as User;

			const { org, secret_key } = await createSandboxForOrg({
				db,
				masterOrg: defaultCtx.org,
				actorUser,
				name: "QA Disconnect Sandbox",
			});
			createdOrg = org;

			await OrgService.update({
				db,
				orgId: org.id,
				updates: {
					stripe_config: {
						...(org.stripe_config ?? {}),
						test_api_key: encryptData("sk_test_disconnect_repro"),
					},
				},
			});

			const connected = await fetchOrg(org.id);
			expect(
				isStripeConnected({
					org: connected,
					env: AppEnv.Sandbox,
					throughSecretKey: true,
				}),
			).toBe(true);

			const res = await fetch(`${apiBase}/organization/stripe`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${secret_key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ channel: "secret_key" }),
			});
			expect(res.status).toBe(200);

			const after = await fetchOrg(org.id);
			expect(after.stripe_config?.test_api_key ?? null).toBeNull();
			expect(
				isStripeConnected({
					org: after,
					env: AppEnv.Sandbox,
					throughSecretKey: true,
				}),
			).toBe(false);
		},
		120_000,
	);
});
