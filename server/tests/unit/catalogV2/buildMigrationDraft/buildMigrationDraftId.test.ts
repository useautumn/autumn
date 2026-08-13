import { expect, test } from "bun:test";
import { planFilterToMigrationIdScope } from "@/internal/catalogV2/actions/buildMigrationDraft/buildMigrationDraftId.js";

test("single plan, pinned version → pro-v3", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", version: 3, custom: false },
		}),
	).toBe("pro-v3");
});

test("single plan, collapsed (no version pin) → pro-all", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", custom: false },
		}),
	).toBe("pro-all");
});

test("single plan, version $in → pro-v1-v2", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", version: { $in: [2, 1] }, custom: false },
		}),
	).toBe("pro-v1-v2");
});

test("two plans, mixed pin + $in → premium-v3+pro-v1-v2", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: {
				$or: [
					{ plan_id: "premium", version: 3 },
					{ plan_id: "pro", version: { $in: [1, 2] } },
				],
				custom: false,
			},
		}),
	).toBe("premium-v3+pro-v1-v2");
});

test("two plans, one collapsed → premium-v1+pro-all", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: {
				$or: [{ plan_id: "premium", version: 1 }, { plan_id: "pro" }],
			},
		}),
	).toBe("premium-v1+pro-all");
});

test("plan_id $in with a shared version → one segment per plan", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: { $in: ["pro", "premium"] }, version: 2 },
		}),
	).toBe("premium-v2+pro-v2");
});

test("includeCustom does not change the scope", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", version: 3 },
		}),
	).toBe("pro-v3");
});
