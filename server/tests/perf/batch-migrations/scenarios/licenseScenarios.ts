import { TestFeature } from "@tests/setup/v2Features";
import type { LicenseScenario } from "./licenseScenarioTypes";

const monthly = (featureId: string, included: number) => ({
	featureId,
	included,
	interval: "month",
});

/**
 * One row per end-to-end case. Guard cases assert the op is REFUSED, which the
 * throughput benchmarks cannot express because they assume the batch lane runs.
 */
export const LICENSE_SCENARIOS: LicenseScenario[] = [
	{
		name: "edit-free-metered",
		description:
			"An allowance edit credits the delta rather than resetting it.",
		seat: [
			monthly(TestFeature.Messages, 100),
			{ featureId: TestFeature.Dashboard, boolean: true },
		],
		op: {
			verb: "edit",
			from: monthly(TestFeature.Messages, 100),
			to: monthly(TestFeature.Messages, 200),
		},
		expect: {
			lane: "batch",
			rowsPerAssignment: { [TestFeature.Messages]: 1 },
			untouched: [TestFeature.Dashboard],
		},
	},
	{
		name: "add-second-interval",
		description:
			"An add at a new interval leaves the existing interval's item in place.",
		seat: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "add",
			item: {
				featureId: TestFeature.Messages,
				included: 300,
				interval: "month",
				intervalCount: 3,
			},
		},
		expect: { lane: "batch", rowsPerAssignment: { [TestFeature.Messages]: 2 } },
	},
	{
		name: "delete-free-metered",
		description: "A free removal drops its rows and spares the siblings.",
		seat: [
			monthly(TestFeature.Messages, 100),
			{ featureId: TestFeature.Dashboard, boolean: true },
		],
		op: { verb: "remove", featureId: TestFeature.Messages },
		expect: {
			lane: "batch",
			rowsPerAssignment: { [TestFeature.Messages]: 0 },
			untouched: [TestFeature.Dashboard],
		},
	},
	{
		name: "delete-priced-refused",
		description:
			"Deleting a paid item needs a Stripe write, so it leaves the batch lane.",
		seat: [
			monthly(TestFeature.Messages, 100),
			{
				featureId: TestFeature.Credits,
				priced: { amount: 10, billingUnits: 100 },
			},
		],
		op: { verb: "remove", featureId: TestFeature.Credits },
		expect: {
			lane: "per_customer",
			rejections: ["priced_remove_item"],
			untouched: [TestFeature.Credits, TestFeature.Messages],
		},
	},
	{
		name: "edit-rollover-refused",
		description:
			"Rollover balances outlive the row they hang off, so the edit leaves the batch lane.",
		seat: [{ ...monthly(TestFeature.Messages, 100), rollover: { max: 500 } }],
		op: {
			verb: "edit",
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
		name: "edit-entity-scoped-refused",
		description:
			"Entity-scoped rows carry per-entity sub-balances, so the edit leaves the batch lane.",
		seat: [
			{
				...monthly(TestFeature.Messages, 100),
				entityFeatureId: TestFeature.Users,
			},
		],
		op: {
			verb: "edit",
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
		name: "add-pooled-refused",
		description:
			"A pooled item's anchor hangs off no customer product, so the add leaves the batch lane.",
		seat: [monthly(TestFeature.Messages, 100)],
		op: {
			verb: "add",
			item: { featureId: TestFeature.Words, included: 50, interval: "month" },
		},
		expect: { lane: "per_customer", rejections: ["pooled_add_item"] },
		skip: "A pooled license item is refused at link time, so the shape cannot be seeded through the API.",
	},
];
