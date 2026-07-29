import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { inArray } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
const MAIN_ORG_ID = defaultCtx.org.id;
const ownedSandbox = generateId("org");
const nonSandboxChild = generateId("org");
const foreignSandbox = generateId("org");
const seededIds = [ownedSandbox, nonSandboxChild, foreignSandbox];

const orgRow = (id: string, createdBy: string, isSandbox: boolean) => ({
	id,
	slug: `list-test-${id}|${createdBy}`,
	name: `n-${id}`,
	logo: "",
	createdAt: new Date(),
	metadata: "",
	created_by: createdBy,
	is_sandbox: isSandbox,
});

beforeAll(async () => {
	await db
		.insert(organizations)
		.values([
			orgRow(ownedSandbox, MAIN_ORG_ID, true),
			orgRow(nonSandboxChild, MAIN_ORG_ID, false),
			orgRow(foreignSandbox, generateId("org"), true),
		]);
});

afterAll(async () => {
	await db.delete(organizations).where(inArray(organizations.id, seededIds));
});

describe("OrgService.listSandboxes", () => {
	test("returns this org's is_sandbox sub-orgs, excluding non-sandbox children and foreign sandboxes", async () => {
		const list = await OrgService.listSandboxes({
			db,
			masterOrgId: MAIN_ORG_ID,
		});
		const ids = list.map((o) => o.id);
		expect(ids).toContain(ownedSandbox);
		expect(ids).not.toContain(nonSandboxChild);
		expect(ids).not.toContain(foreignSandbox);
	});
});
