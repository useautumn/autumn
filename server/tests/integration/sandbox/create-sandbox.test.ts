import { afterAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	AuthType,
	member,
	type Organization,
	OrgConfigSchema,
	organizations,
} from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { User } from "better-auth";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	assertDashboardActor,
	assertNotSandboxContext,
	createSandboxForOrg,
} from "@/internal/sandboxes/createSandbox.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
let createdOrg: Organization | undefined;
let inheritSandbox: Organization | undefined;
let inheritMasterId: string | undefined;

afterAll(async () => {
	for (const org of [createdOrg, inheritSandbox]) {
		if (org) {
			await deletePlatformSubOrg({
				db,
				org,
				logger,
				skipLiveCustomerCheck: true,
			}).catch(() => {});
		}
	}
	if (inheritMasterId) {
		await db
			.delete(organizations)
			.where(eq(organizations.id, inheritMasterId))
			.catch(() => {});
	}
});

describe("assertDashboardActor (sandbox create guard)", () => {
	const user = { id: "u1", email: "a@b.c" } as unknown as User;

	test("returns the user for a dashboard session", () => {
		expect(assertDashboardActor({ authType: AuthType.Dashboard, user })).toBe(
			user,
		);
	});

	test("rejects a non-dashboard auth type (e.g. API key)", () => {
		expect(() =>
			assertDashboardActor({ authType: AuthType.SecretKey, user }),
		).toThrow();
	});

	test("rejects a dashboard session with no user", () => {
		expect(() =>
			assertDashboardActor({ authType: AuthType.Dashboard, user: undefined }),
		).toThrow();
	});
});

describe("assertNotSandboxContext (no nested sandboxes)", () => {
	test("allows a main (non-sandbox) org", () => {
		expect(() => assertNotSandboxContext({ is_sandbox: false })).not.toThrow();
	});

	test("rejects operating from within a sandbox org", () => {
		expect(() => assertNotSandboxContext({ is_sandbox: true })).toThrow();
	});
});

describe("createSandboxForOrg", () => {
	test("creates an is_sandbox sub-org under the master, with no member row + its own key", async () => {
		const actorUser = (await db.query.user.findFirst()) as unknown as User;
		const { org, secret_key } = await createSandboxForOrg({
			db,
			masterOrg: defaultCtx.org,
			actorUser,
			name: "My QA Sandbox",
		});
		createdOrg = org;

		expect(org.created_by).toBe(defaultCtx.org.id);
		expect(org.is_sandbox).toBe(true);
		expect(secret_key).toMatch(/^am_sk_test/);
		expect(org.slug).toContain("my-qa-sandbox");
		expect(org.slug.endsWith(`|${defaultCtx.org.id}`)).toBe(true);

		const members = await db.query.member.findMany({
			where: eq(member.organizationId, org.id),
		});
		expect(members.length).toBe(0);
	}, 120_000);

	test("a new sandbox inherits the master org's config", async () => {
		const actorUser = (await db.query.user.findFirst()) as unknown as User;

		const masterConfig = OrgConfigSchema.parse({
			default_applies_to_entities: true,
			prorate_unused: false,
		});
		inheritMasterId = generateId("org");
		await db.insert(organizations).values({
			id: inheritMasterId,
			slug: `cfg-master-${crypto.randomUUID()}`,
			name: "cfg-master",
			createdAt: new Date(),
			created_at: Date.now(),
			is_sandbox: false,
			stripe_connected: false,
			default_currency: "usd",
			config: masterConfig,
			onboarded: true,
			test_pkey: generatePublishableKey(AppEnv.Sandbox),
			live_pkey: generatePublishableKey(AppEnv.Live),
		});
		const master = await OrgService.get({ db, orgId: inheritMasterId });

		const { org } = await createSandboxForOrg({
			db,
			masterOrg: master,
			actorUser,
			name: "Config Inherit Sandbox",
		});
		inheritSandbox = org;

		expect(org.config.default_applies_to_entities).toBe(true);
		expect(org.config.prorate_unused).toBe(false);
		expect(org.config).toEqual(masterConfig);
	}, 120_000);
});
