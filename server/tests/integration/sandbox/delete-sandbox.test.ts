import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ErrCode, type Organization, organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { User } from "better-auth";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";
import { deleteSandboxForOrg } from "@/internal/sandboxes/deleteSandbox.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
const masterOrg = defaultCtx.org;
let sandboxId = "";
let deleted = false;

const orgExists = async (id: string) =>
	Boolean(
		await db.query.organizations.findFirst({
			where: eq(organizations.id, id),
		}),
	);

beforeAll(async () => {
	const actorUser = (await db.query.user.findFirst()) as unknown as User;
	const { org } = await createSandboxForOrg({
		db,
		masterOrg,
		actorUser,
		name: "Delete IntTest Sandbox",
	});
	sandboxId = org.id;
}, 120_000);

afterAll(async () => {
	if (!sandboxId || deleted) {
		return;
	}
	const org = await db.query.organizations.findFirst({
		where: eq(organizations.id, sandboxId),
	});
	if (org) {
		await deletePlatformSubOrg({
			db,
			org: org as Organization,
			logger,
			skipLiveCustomerCheck: true,
		});
	}
});

describe("deleteSandboxForOrg end-to-end (real teardown + live guards)", () => {
	test("rejects deleting the master org and leaves it intact", async () => {
		await expect(
			deleteSandboxForOrg({ db, masterOrg, sandboxId: masterOrg.id, logger }),
		).rejects.toMatchObject({ code: ErrCode.OrgNotFound });
		expect(await orgExists(masterOrg.id)).toBe(true);
	});

	test("rejects an unknown org id", async () => {
		await expect(
			deleteSandboxForOrg({
				db,
				masterOrg,
				sandboxId: generateId("org"),
				logger,
			}),
		).rejects.toMatchObject({ code: ErrCode.OrgNotFound });
	});

	test("leaves the owned sandbox untouched after rejected deletes", async () => {
		expect(await orgExists(sandboxId)).toBe(true);
	});

	test("tears down an owned sandbox sub-org (org row removed)", async () => {
		await deleteSandboxForOrg({ db, masterOrg, sandboxId, logger });
		expect(await orgExists(sandboxId)).toBe(false);
		deleted = true;
	}, 60_000);
});
