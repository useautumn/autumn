import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ErrCode, type Organization, organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { User } from "better-auth";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";
import { updateSandboxForOrg } from "@/internal/sandboxes/updateSandbox.js";

const { db } = initDrizzle();
const masterOrg = defaultCtx.org;
let sandbox: Organization | undefined;
let sandboxId = "";

const getRow = async () =>
	(await db.query.organizations.findFirst({
		where: eq(organizations.id, sandboxId),
	})) as Organization;

beforeAll(async () => {
	const actorUser = (await db.query.user.findFirst()) as unknown as User;
	const { org } = await createSandboxForOrg({
		db,
		masterOrg,
		actorUser,
		name: "Display IntTest",
		color: "blue",
		icon: "Rocket",
	});
	sandbox = org;
	sandboxId = org.id;
}, 120_000);

afterAll(async () => {
	if (sandbox) {
		await deletePlatformSubOrg({
			db,
			org: sandbox,
			logger,
			skipLiveCustomerCheck: true,
		});
	}
});

describe("per-sandbox colour + icon (create + update persistence)", () => {
	test("create persists the chosen colour + icon", async () => {
		const row = await getRow();
		expect(row.sandbox_color).toBe("blue");
		expect(row.sandbox_icon).toBe("Rocket");
	});

	test("update changes name/colour/icon and keeps the slug stable", async () => {
		const before = await getRow();
		await updateSandboxForOrg({
			db,
			masterOrg,
			sandboxId,
			updates: { name: "Renamed Display", color: "amber", icon: "Bug" },
		});
		const after = await getRow();
		expect(after.name).toBe("Renamed Display");
		expect(after.sandbox_color).toBe("amber");
		expect(after.sandbox_icon).toBe("Bug");
		expect(after.slug).toBe(before.slug);
	});

	test("partial update leaves other fields unchanged", async () => {
		await updateSandboxForOrg({
			db,
			masterOrg,
			sandboxId,
			updates: { color: "green" },
		});
		const after = await getRow();
		expect(after.sandbox_color).toBe("green");
		expect(after.name).toBe("Renamed Display");
		expect(after.sandbox_icon).toBe("Bug");
	});

	test("a foreign-owner update is rejected and does not mutate the row", async () => {
		const before = await getRow();
		await expect(
			updateSandboxForOrg({
				db,
				masterOrg: { id: "org_not_owner" } as Organization,
				sandboxId,
				updates: { color: "red" },
			}),
		).rejects.toMatchObject({ code: ErrCode.OrgNotFound });
		const after = await getRow();
		expect(after.sandbox_color).toBe(before.sandbox_color);
	});
});
