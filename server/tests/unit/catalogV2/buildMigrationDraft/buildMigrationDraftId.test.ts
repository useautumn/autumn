import { expect, test } from "bun:test";
import { planFilterToMigrationIdScope } from "@/internal/catalogV2/actions/buildMigrationDraft/buildMigrationDraftId.js";

test("single plan ignores version pin", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", version: 3, custom: false },
		}),
	).toBe("pro");
});

test("single plan ignores collapsed / missing version", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", custom: false },
		}),
	).toBe("pro");
});

test("single plan ignores version $in", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", version: { $in: [2, 1] }, custom: false },
		}),
	).toBe("pro");
});

test("two plans → sorted ids, no versions", () => {
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
	).toBe("premium-and-pro");
});

test("plan_id $in → sorted ids, no versions", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: { $in: ["pro", "premium"] }, version: 2 },
		}),
	).toBe("premium-and-pro");
});

test("3+ $or branches keep the first plan and a remainder count", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: {
				$or: [
					{ plan_id: "growth", version: 1 },
					{ plan_id: "growth_monthly_500k", version: 1 },
					{ plan_id: "growth_monthly_650k", version: 1 },
					{ plan_id: "growth_yearly", version: 1 },
					{ plan_id: "growth_yearly_500k", version: 1 },
					{ plan_id: "growth_yearly_650k", version: 1 },
				],
			},
		}),
	).toBe("growth-and-5-more");
});

test("plan_id $in with 3+ plans keeps the first and a remainder count", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: {
				plan_id: {
					$in: [
						"growth_yearly_650k",
						"growth",
						"growth_monthly_500k",
						"growth_yearly",
					],
				},
				version: 1,
			},
		}),
	).toBe("growth-and-3-more");
});

test("same plan on two version branches collapses to one id", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: {
				$or: [
					{ plan_id: "pro", version: 1 },
					{ plan_id: "pro", version: 2 },
				],
			},
		}),
	).toBe("pro");
});

test("includeCustom does not change the scope", () => {
	expect(
		planFilterToMigrationIdScope({
			planFilter: { plan_id: "pro", version: 3 },
		}),
	).toBe("pro");
});
