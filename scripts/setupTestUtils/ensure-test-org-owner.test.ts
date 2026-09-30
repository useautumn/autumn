import { describe, expect, test } from "bun:test";
import { member } from "@autumn/shared";
import { ensureTestOrgOwner, TEST_ORG_CONFIG } from "./createTestOrg.ts";

const createDb = ({
	existingMembers,
}: {
	existingMembers: { id: string }[];
}) => {
	const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
	const db = {
		select: () => ({
			from: () => ({
				where: () => ({ limit: async () => existingMembers }),
			}),
		}),
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
			},
		}),
	};
	return { db: db as never, inserts };
};

describe("ensureTestOrgOwner", () => {
	test("adds the setup inviter as an owner member when it is not a member", async () => {
		const { db, inserts } = createDb({ existingMembers: [] });

		await ensureTestOrgOwner({ db });

		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe(member);
		expect(inserts[0].values).toMatchObject({
			organizationId: TEST_ORG_CONFIG.id,
			userId: "user_setup_test_inviter",
			role: "owner",
		});
	});

	test("skips the insert when the setup inviter is already a member", async () => {
		const { db, inserts } = createDb({ existingMembers: [{ id: "mem_1" }] });

		await ensureTestOrgOwner({ db });

		expect(inserts).toHaveLength(0);
	});
});
