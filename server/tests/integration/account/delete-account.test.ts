import { afterAll, expect, test } from "bun:test";
import { AppEnv, customers, member, organizations, user } from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deleteAccount } from "@/internal/account/deleteAccount.js";
import { deleteOrg } from "@/internal/orgs/deleteOrg/deleteOrg.js";

const { db } = initDrizzle();
const prefix = `del_acct_${crypto.randomUUID().slice(0, 8)}`;
const id = (key: string) => `${prefix}_${key}`;
const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

const createUser = async (key: string) => {
	const now = new Date();
	await db.insert(user).values({
		id: id(key),
		name: key,
		email: `${id(key)}@example.com`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	createdUserIds.push(id(key));
	return id(key);
};

const createOrg = async (
	key: string,
	{ sandboxOf }: { sandboxOf?: string } = {},
) => {
	await db.insert(organizations).values({
		id: id(key),
		slug: id(key),
		name: id(key),
		createdAt: new Date(),
		created_at: Date.now(),
		...(sandboxOf && { is_sandbox: true, created_by: sandboxOf }),
	});
	createdOrgIds.push(id(key));
	return id(key);
};

const addMember = async (userId: string, orgId: string, role: string) => {
	await db.insert(member).values({
		id: `${userId}_${orgId}`,
		userId,
		organizationId: orgId,
		role,
		createdAt: new Date(),
	});
};

const addCustomer = async (orgId: string, env: AppEnv) => {
	const customerId = `${orgId}_cus_${env}`;
	await db.insert(customers).values({
		internal_id: customerId,
		id: customerId,
		org_id: orgId,
		env,
		created_at: Date.now(),
	});
};

const existingOrgIds = async (orgIds: string[]) =>
	(
		await db
			.select({ id: organizations.id })
			.from(organizations)
			.where(inArray(organizations.id, orgIds))
	).map((org) => org.id);

const userExists = async (userId: string) =>
	(await db.select().from(user).where(eq(user.id, userId))).length > 0;

afterAll(async () => {
	if (createdOrgIds.length > 0) {
		await db.delete(customers).where(inArray(customers.org_id, createdOrgIds));
		await db
			.delete(organizations)
			.where(inArray(organizations.id, createdOrgIds));
	}
	if (createdUserIds.length > 0) {
		await db.delete(user).where(inArray(user.id, createdUserIds));
	}
});

test("deleteOrg removes the org's named sandboxes", async () => {
	const orgId = await createOrg("single");
	const sandboxId = await createOrg("single_sbx", { sandboxOf: orgId });
	await addCustomer(sandboxId, AppEnv.Sandbox);

	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.id, orgId));
	await deleteOrg({ db, org: org as never, logger, deleteOrgFromDb: true });

	expect(await existingOrgIds([orgId, sandboxId])).toEqual([]);
});

test("deleteAccount protects the last owner of a shared org, then deletes sole-member orgs", async () => {
	const userA = await createUser("a");
	const userB = await createUser("b");
	const soloOrg = await createOrg("solo");
	const soloSandbox = await createOrg("solo_sbx", { sandboxOf: soloOrg });
	const sharedOrg = await createOrg("shared");
	const ownedSharedOrg = await createOrg("owned_shared");
	await addCustomer(soloSandbox, AppEnv.Sandbox);
	await addMember(userA, soloOrg, "owner");
	await addMember(userA, sharedOrg, "member");
	await addMember(userB, sharedOrg, "owner");
	await addMember(userA, ownedSharedOrg, "owner");
	await addMember(userB, ownedSharedOrg, "member");

	await expect(deleteAccount({ db, userId: userA, logger })).rejects.toThrow(
		"only owner",
	);
	expect(await userExists(userA)).toBe(true);
	expect(await existingOrgIds([soloOrg, soloSandbox])).toHaveLength(2);

	await db
		.update(member)
		.set({ role: "owner" })
		.where(eq(member.id, `${userB}_${ownedSharedOrg}`));
	await deleteAccount({ db, userId: userA, logger });

	expect(await userExists(userA)).toBe(false);
	expect(await userExists(userB)).toBe(true);
	expect(
		(
			await existingOrgIds([soloOrg, soloSandbox, sharedOrg, ownedSharedOrg])
		).sort(),
	).toEqual([ownedSharedOrg, sharedOrg].sort());
});

test("deleteAccount deletes nothing when an org has live customers", async () => {
	const userC = await createUser("c");
	const cleanOrg = await createOrg("c_clean");
	const liveOrg = await createOrg("c_live");
	await addMember(userC, cleanOrg, "owner");
	await addMember(userC, liveOrg, "owner");
	await addCustomer(liveOrg, AppEnv.Live);

	await expect(deleteAccount({ db, userId: userC, logger })).rejects.toThrow(
		"production mode customers",
	);
	expect(await userExists(userC)).toBe(true);
	expect(await existingOrgIds([cleanOrg, liveOrg])).toHaveLength(2);
});
