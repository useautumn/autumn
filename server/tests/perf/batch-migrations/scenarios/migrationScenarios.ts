import { TestFeature } from "@tests/setup/v2Features";
import type { ItemSpec, MigrationScenario } from "./migrationScenarioTypes";

const monthly = (featureId: string, included: number): ItemSpec => ({
	featureId,
	included,
	interval: "month",
});

const boolean = (featureId: string): ItemSpec => ({ featureId, boolean: true });

/**
 * One row per end-to-end case, across both op families and every feature shape
 * the lanes have to tell apart. Rejection rows matter as much as the rest: they
 * pin which shapes the set-based lane refuses, which the throughput benchmarks
 * cannot express because they exit when the lane declines.
 */
export const MIGRATION_SCENARIOS: MigrationScenario[] = [
	// ── Plan items: the batch lane is add-only ────────────────────────
	{
		name: "plan-add-metered",
		description: "Adding a free metered item to a plan lands on every holder.",
		planItems: [boolean(TestFeature.Dashboard)],
		op: {
			verb: "add",
			target: "plan",
			item: monthly(TestFeature.Messages, 100),
		},
		expect: {
			lane: "batch",
			rowsPerTarget: { [TestFeature.Messages]: 1 },
			balance: { [TestFeature.Messages]: 100 },
			untouched: [TestFeature.Dashboard],
		},
	},
	{
		name: "plan-add-boolean",
		description: "A boolean grant carries no balance and still lands.",
		planItems: [monthly(TestFeature.Messages, 100)],
		op: { verb: "add", target: "plan", item: boolean(TestFeature.Dashboard) },
		expect: {
			lane: "batch",
			rowsPerTarget: { [TestFeature.Dashboard]: 1 },
			untouched: [TestFeature.Messages],
		},
	},
	{
		name: "plan-add-continuous-use",
		description: "A continuous-use feature lands like any other free item.",
		planItems: [boolean(TestFeature.Dashboard)],
		op: { verb: "add", target: "plan", item: monthly(TestFeature.Users, 5) },
		expect: {
			lane: "batch",
			rowsPerTarget: { [TestFeature.Users]: 1 },
			balance: { [TestFeature.Users]: 5 },
		},
	},
	{
		name: "plan-add-credit-system",
		description: "A credit system resolves its schema and lands.",
		planItems: [boolean(TestFeature.Dashboard)],
		op: {
			verb: "add",
			target: "plan",
			item: monthly(TestFeature.Credits, 500),
		},
		expect: {
			lane: "batch",
			rowsPerTarget: { [TestFeature.Credits]: 1 },
			balance: { [TestFeature.Credits]: 500 },
		},
	},
	{
		name: "plan-add-unlimited",
		description: "An unlimited grant tracks no balance.",
		planItems: [boolean(TestFeature.Dashboard)],
		op: {
			verb: "add",
			target: "plan",
			item: { featureId: TestFeature.Words, unlimited: true },
		},
		expect: { lane: "batch", rowsPerTarget: { [TestFeature.Words]: 1 } },
	},
	{
		name: "plan-add-priced-refused",
		description: "A paid item charges, so it leaves the charge-free lane.",
		planItems: [boolean(TestFeature.Dashboard)],
		op: {
			verb: "add",
			target: "plan",
			item: {
				featureId: TestFeature.Words,
				priced: { amount: 10, billingUnits: 100 },
			},
		},
		expect: { lane: "per_customer", rejections: ["priced_add_item"] },
	},
	{
		name: "plan-remove-refused",
		description: "Plan item removal is not batch-lowered.",
		planItems: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "remove",
			target: "plan",
			item: monthly(TestFeature.Messages, 100),
		},
		expect: {
			lane: "per_customer",
			rejections: ["unsupported_remove_items"],
			untouched: [TestFeature.Messages],
		},
	},
	{
		name: "plan-edit-refused",
		description:
			"An allowance edit is a remove plus an add, which the plan lane declines.",
		planItems: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "edit",
			target: "plan",
			from: monthly(TestFeature.Messages, 100),
			to: monthly(TestFeature.Messages, 200),
		},
		expect: {
			lane: "per_customer",
			rejections: ["unsupported_remove_items"],
			untouched: [TestFeature.Messages],
		},
	},

	// ── License items: all three verbs are batch-lowered ──────────────
	{
		name: "license-add-metered",
		description: "A license add fans out to every live seat assignment.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "add",
			target: "license",
			item: monthly(TestFeature.Words, 50),
		},
		expect: {
			lane: "batch",
			rowsPerTarget: { [TestFeature.Words]: 1 },
			untouched: [TestFeature.Messages],
		},
	},
	{
		name: "license-edit-credits-delta",
		description:
			"An allowance edit credits the delta rather than resetting it.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "edit",
			target: "license",
			from: monthly(TestFeature.Messages, 100),
			to: monthly(TestFeature.Messages, 200),
		},
		expect: { lane: "batch", rowsPerTarget: { [TestFeature.Messages]: 1 } },
	},
	{
		name: "license-add-second-interval",
		description: "An add at a new interval leaves the existing one in place.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "add",
			target: "license",
			item: {
				featureId: TestFeature.Messages,
				included: 300,
				interval: "month",
				intervalCount: 3,
			},
		},
		expect: { lane: "batch", rowsPerTarget: { [TestFeature.Messages]: 2 } },
	},
	{
		name: "license-remove-free",
		description: "A free removal drops its rows and spares the siblings.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [
			monthly(TestFeature.Messages, 100),
			monthly(TestFeature.Words, 50),
		],
		op: {
			verb: "remove",
			target: "license",
			item: monthly(TestFeature.Messages, 100),
		},
		expect: {
			lane: "batch",
			rowsPerTarget: { [TestFeature.Messages]: 0 },
			untouched: [TestFeature.Words],
		},
	},
	{
		name: "license-remove-priced-refused",
		description: "Deleting a paid license item needs a Stripe write.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [
			monthly(TestFeature.Messages, 100),
			{
				featureId: TestFeature.Credits,
				priced: { amount: 10, billingUnits: 100 },
			},
		],
		op: {
			verb: "remove",
			target: "license",
			item: { featureId: TestFeature.Credits },
		},
		expect: {
			lane: "per_customer",
			rejections: ["priced_remove_item"],
			untouched: [TestFeature.Credits, TestFeature.Messages],
		},
	},
	{
		name: "license-edit-rollover-refused",
		description: "Rollover balances outlive the row they hang off.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [
			{ ...monthly(TestFeature.Messages, 100), rollover: { max: 500 } },
		],
		op: {
			verb: "edit",
			target: "license",
			from: monthly(TestFeature.Messages, 100),
			to: monthly(TestFeature.Messages, 200),
		},
		expect: {
			lane: "per_customer",
			rejections: ["rollover_remove_item"],
			untouched: [TestFeature.Messages],
		},
	},
	{
		name: "license-edit-entity-scoped-refused",
		description: "Entity-scoped rows carry per-entity sub-balances.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [
			{
				...monthly(TestFeature.Messages, 100),
				entityFeatureId: TestFeature.Users,
			},
		],
		op: {
			verb: "edit",
			target: "license",
			from: monthly(TestFeature.Messages, 100),
			to: monthly(TestFeature.Messages, 200),
		},
		expect: {
			lane: "per_customer",
			rejections: ["entity_scoped_entitlement"],
			untouched: [TestFeature.Messages],
		},
	},
	{
		name: "license-add-pooled-refused",
		description: "A pooled item's anchor hangs off no customer product.",
		planItems: [boolean(TestFeature.Dashboard)],
		licenseItems: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "add",
			target: "license",
			item: { featureId: TestFeature.Words, included: 50, pooled: true },
		},
		expect: { lane: "per_customer", rejections: ["pooled_add_item"] },
		skip: "A pooled license item is refused at link time, so the shape cannot be seeded through the API.",
	},
];
