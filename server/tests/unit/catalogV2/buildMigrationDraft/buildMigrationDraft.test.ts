/**
 * buildMigrationDraft kernel: targets → buckets → filter + update_plan ops.
 *
 * Contract:
 *   - one op per unique migratable customize
 *   - filter grouped per plan (version `$in` within a plan, `$or` across)
 *   - unversioned collapse when targets cover every customer-bearing version
 *   - custom: false unless includeCustom
 *   - previous_price stamped only when uniform in a price-changing bucket
 *   - trial-only / empty customize → null
 */

import { expect, test } from "bun:test";
import { BillingInterval, type DiffedCustomizePlanV1, ResetInterval } from "@autumn/shared";
import { buildMigrationDraft } from "@/internal/catalogV2/actions/buildMigrationDraft/buildMigrationDraft.js";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types.js";

const messagesDiff = ({
	included,
}: {
	included: number;
}): DiffedCustomizePlanV1 => ({
	remove_items: [
		{
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: "messages",
			included,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	],
});

const monthPrice = ({
	amount,
}: {
	amount: number;
}): NonNullable<MigrationTarget["previousPrice"]> => ({
	amount,
	interval: BillingInterval.Month,
});

const updatePlanOps = (draft: ReturnType<typeof buildMigrationDraft>) =>
	(draft?.operations.customer ?? []).filter(
		(operation) => operation.type === "update_plan",
	);

const target = (
	overrides: Partial<MigrationTarget> &
		Pick<MigrationTarget, "planId" | "version">,
): MigrationTarget => ({
	customize: messagesDiff({ included: 500 }),
	previousPrice: null,
	hasBillingChanges: false,
	includeCustom: false,
	...overrides,
});

test("one target → version-pinned filter, one op, custom:false", () => {
	const draft = buildMigrationDraft({
		targets: [target({ planId: "pro", version: 3 })],
		versionsWithCustomersByPlanId: { pro: [3] },
	});
	const operations = updatePlanOps(draft);
	const [operation] = operations;

	expect(draft?.filter).toEqual({
		customer: { plan: { plan_id: "pro", version: 3, custom: false } },
	});
	expect(operation).toEqual({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 3, custom: false },
		customize: messagesDiff({ included: 500 }),
	});
	expect(operation).not.toHaveProperty("version");
	expect(draft?.no_billing_changes).toBe(true);
	expect(draft?.id).toMatch(/^pro-v3-update-/);
});

test("includeCustom true omits custom guard on filter and ops", () => {
	const draft = buildMigrationDraft({
		targets: [target({ planId: "pro", version: 3, includeCustom: true })],
		versionsWithCustomersByPlanId: { pro: [3] },
	});
	const operations = updatePlanOps(draft);
	const [operation] = operations;

	expect(draft?.filter).toEqual({
		customer: { plan: { plan_id: "pro", version: 3 } },
	});
	expect(operation?.plan_filter).toEqual({ plan_id: "pro", version: 3 });
});

test("identical diffs covering every customer version collapse the version pin", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({ planId: "pro", version: 1 }),
			target({ planId: "pro", version: 2 }),
		],
		versionsWithCustomersByPlanId: { pro: [1, 2] },
	});
	const operations = updatePlanOps(draft);

	expect(draft?.filter).toEqual({
		customer: { plan: { plan_id: "pro", custom: false } },
	});
	expect(operations).toHaveLength(1);
	expect(operations[0]?.plan_filter).toEqual({
		plan_id: "pro",
		custom: false,
	});
	expect(draft?.id).toMatch(/^pro-all-update-/);
});

test("missing a customer-bearing version keeps version $in (no collapse)", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({ planId: "pro", version: 1 }),
			target({ planId: "pro", version: 2 }),
		],
		versionsWithCustomersByPlanId: { pro: [1, 2, 3] },
	});

	expect(draft?.filter).toEqual({
		customer: {
			plan: { plan_id: "pro", version: { $in: [1, 2] }, custom: false },
		},
	});
});

test("differing per-version diffs → two ops; top-level filter still collapses", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				customize: messagesDiff({ included: 200 }),
			}),
			target({
				planId: "pro",
				version: 2,
				customize: messagesDiff({ included: 500 }),
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1, 2] },
	});
	const operations = updatePlanOps(draft);

	expect(draft?.filter).toEqual({
		customer: { plan: { plan_id: "pro", custom: false } },
	});
	expect(operations).toHaveLength(2);
	expect(operations.map((op) => op.plan_filter)).toEqual([
		{ plan_id: "pro", version: 1, custom: false },
		{ plan_id: "pro", version: 2, custom: false },
	]);
});

test("two plans → $or of per-plan branches; custom is a sibling of $or", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({ planId: "pro", version: 1 }),
			target({ planId: "pro", version: 2 }),
			target({ planId: "premium", version: 3 }),
		],
		versionsWithCustomersByPlanId: { pro: [1, 2, 3], premium: [3] },
	});

	expect(draft?.filter).toEqual({
		customer: {
			plan: {
				$or: [
					{ plan_id: "premium", version: 3 },
					{ plan_id: "pro", version: { $in: [1, 2] } },
				],
				custom: false,
			},
		},
	});
	expect(draft?.id).toMatch(/^premium-v3\+pro-v1-v2-update-/);
});

test("two plans with different customize → $or filter, one op per customize", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				customize: messagesDiff({ included: 100 }),
			}),
			target({
				planId: "premium",
				version: 1,
				customize: messagesDiff({ included: 200 }),
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1], premium: [1] },
	});
	const operations = updatePlanOps(draft);

	expect(draft?.filter).toEqual({
		customer: {
			plan: {
				$or: [
					{ plan_id: "premium", version: 1 },
					{ plan_id: "pro", version: 1 },
				],
				custom: false,
			},
		},
	});
	expect(operations).toHaveLength(2);
	expect(operations.map((op) => op.plan_filter)).toEqual([
		{ plan_id: "premium", version: 1, custom: false },
		{ plan_id: "pro", version: 1, custom: false },
	]);
	expect(operations.map((op) => op.customize)).toEqual([
		messagesDiff({ included: 200 }),
		messagesDiff({ included: 100 }),
	]);
});

test("mixed includeCustom → outer filter omits custom; each op carries its own guard", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({ planId: "pro", version: 1, includeCustom: false }),
			target({
				planId: "premium",
				version: 1,
				includeCustom: true,
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1], premium: [1] },
	});
	const operations = updatePlanOps(draft);

	expect(draft?.filter).toEqual({
		customer: {
			plan: {
				$or: [
					{ plan_id: "premium", version: 1 },
					{ plan_id: "pro", version: 1 },
				],
			},
		},
	});
	expect(operations.map((op) => op.plan_filter)).toEqual([
		{ plan_id: "premium", version: 1 },
		{ plan_id: "pro", version: 1, custom: false },
	]);
});

test("reversed add_items still one op", () => {
	const messages = {
		feature_id: "messages",
		included: 100,
		reset: { interval: ResetInterval.Month },
	};
	const seats = { feature_id: "seats", included: 5 };
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				customize: { add_items: [messages, seats] },
			}),
			target({
				planId: "premium",
				version: 1,
				customize: { add_items: [seats, messages] },
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1], premium: [1] },
	});

	expect(updatePlanOps(draft)).toHaveLength(1);
});

test("previous_price stamped when uniform in a price-changing bucket", () => {
	const previous = monthPrice({ amount: 20 });
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				customize: { price: monthPrice({ amount: 30 }) },
				previousPrice: previous,
				hasBillingChanges: true,
			}),
			target({
				planId: "pro",
				version: 2,
				customize: { price: monthPrice({ amount: 30 }) },
				previousPrice: previous,
				hasBillingChanges: true,
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1, 2] },
	});
	const operations = updatePlanOps(draft);
	const [operation] = operations;

	expect(operation?.customize).toEqual({
		price: monthPrice({ amount: 30 }),
		previous_price: previous,
	});
	expect(draft?.no_billing_changes).toBe(false);
});

test("previous_price omitted when previous prices in the bucket differ", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				customize: { price: monthPrice({ amount: 30 }) },
				previousPrice: monthPrice({ amount: 20 }),
				hasBillingChanges: true,
			}),
			target({
				planId: "pro-eur",
				version: 1,
				customize: { price: monthPrice({ amount: 30 }) },
				previousPrice: monthPrice({ amount: 25 }),
				hasBillingChanges: true,
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1], "pro-eur": [1] },
	});
	const operations = updatePlanOps(draft);
	const [operation] = operations;

	expect(operation?.customize).toEqual({
		price: monthPrice({ amount: 30 }),
	});
	expect(operation?.customize).not.toHaveProperty("previous_price");
});

test("previous_price omitted when customize has no price lane", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				previousPrice: monthPrice({ amount: 20 }),
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1] },
	});
	const operations = updatePlanOps(draft);
	const [operation] = operations;

	expect(operation?.customize).not.toHaveProperty("previous_price");
});

test("trial-only customize is stripped → no draft", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({
				planId: "pro",
				version: 1,
				customize: { free_trial: null },
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1] },
	});

	expect(draft).toBeNull();
});

test("empty targets → null", () => {
	expect(
		buildMigrationDraft({
			targets: [],
			versionsWithCustomersByPlanId: {},
		}),
	).toBeNull();
});

test("any target with billing changes sets no_billing_changes false", () => {
	const draft = buildMigrationDraft({
		targets: [
			target({ planId: "pro", version: 1, hasBillingChanges: false }),
			target({
				planId: "pro",
				version: 2,
				customize: { price: monthPrice({ amount: 30 }) },
				hasBillingChanges: true,
			}),
		],
		versionsWithCustomersByPlanId: { pro: [1, 2] },
	});

	expect(draft?.no_billing_changes).toBe(false);
});
