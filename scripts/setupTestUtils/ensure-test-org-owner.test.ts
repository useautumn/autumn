import { describe, expect, test } from "bun:test";
import { member, user } from "@autumn/shared";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { ensureTestOrgOwner, TEST_ORG_CONFIG } from "./createTestOrg.ts";

const INVITER_ID = "user_setup_test_inviter";

const createDb = ({
	existingMembers,
}: {
	existingMembers: { id: string; role: string }[];
}) => {
	const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
	const updates: { set: Record<string, unknown>; where: SQL }[] = [];
	const lookups: SQL[] = [];
	const db = {
		select: () => ({
			from: () => ({
				where: (condition: SQL) => {
					lookups.push(condition);
					return { limit: async () => existingMembers };
				},
			}),
		}),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				inserts.push({ table, values });
				return Object.assign(Promise.resolve(), {
					onConflictDoNothing: async () => {},
				});
			},
		}),
		update: () => ({
			set: (set: Record<string, unknown>) => ({
				where: async (where: SQL) => {
					updates.push({ set, where });
				},
			}),
		}),
	};
	return { db: db as never, inserts, updates, lookups };
};

const toParams = (condition: SQL) =>
	new PgDialect().sqlToQuery(condition).params;

const memberInserts = (inserts: ReturnType<typeof createDb>["inserts"]) =>
	inserts.filter((insert) => insert.table === member);

describe("ensureTestOrgOwner", () => {
	test("adds the setup inviter as an owner member when it is not a member", async () => {
		const { db, inserts, updates } = createDb({ existingMembers: [] });

		await ensureTestOrgOwner({ db });

		expect(inserts.find((i) => i.table === user)?.values).toMatchObject({
			id: INVITER_ID,
		});
		expect(memberInserts(inserts)).toHaveLength(1);
		expect(memberInserts(inserts)[0].values).toMatchObject({
			organizationId: TEST_ORG_CONFIG.id,
			userId: INVITER_ID,
			role: "owner",
		});
		expect(updates).toHaveLength(0);
	});

	test("looks up only the setup inviter's membership in the test org", async () => {
		const { db, lookups } = createDb({ existingMembers: [] });

		await ensureTestOrgOwner({ db });

		expect(lookups).toHaveLength(1);
		expect(toParams(lookups[0]).sort()).toEqual(
			[TEST_ORG_CONFIG.id, INVITER_ID].sort(),
		);
	});

	test("skips writes when the setup inviter is already an owner", async () => {
		const { db, inserts, updates } = createDb({
			existingMembers: [{ id: "mem_1", role: "owner" }],
		});

		await ensureTestOrgOwner({ db });

		expect(memberInserts(inserts)).toHaveLength(0);
		expect(updates).toHaveLength(0);
	});

	test("promotes an existing non-owner membership instead of duplicating it", async () => {
		const { db, inserts, updates } = createDb({
			existingMembers: [{ id: "mem_1", role: "member" }],
		});

		await ensureTestOrgOwner({ db });

		expect(memberInserts(inserts)).toHaveLength(0);
		expect(updates).toHaveLength(1);
		expect(updates[0].set).toEqual({ role: "owner" });
		expect(toParams(updates[0].where)).toEqual(["mem_1"]);
	});
});
