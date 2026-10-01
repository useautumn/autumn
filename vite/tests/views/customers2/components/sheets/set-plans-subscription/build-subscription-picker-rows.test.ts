import { describe, expect, test } from "bun:test";
import { CusProductStatus, type Entity } from "@autumn/shared";
import { format } from "date-fns";
import {
	buildSubscriptionPickerRows,
	subscriptionPickerRowToTarget,
} from "@/views/customers2/components/sheets/set-plans-subscription/utils/buildSubscriptionPickerRows";
import { findUnlinkedFreePlanNames } from "@/views/customers2/components/sheets/set-plans-subscription/utils/findUnlinkedFreePlanNames";
import {
	makeCustomerProduct,
	makeProposal,
	makeStripeSchedule,
	makeStripeSubscription,
	PERIOD_END_SECONDS,
} from "./setPlansSubscriptionFixtures";

const entities = [
	{ id: "ent_1", internal_id: "int_ent_1", name: "Acme Workspace" },
] as unknown as Entity[];

const customerProducts = [
	makeCustomerProduct({
		id: "pro",
		productName: "Pro",
		subscriptionIds: ["sub_aaaaxxxxxxxxbbbb"],
	}),
	makeCustomerProduct({
		id: "addon",
		productName: "Addon",
		subscriptionIds: ["sub_aaaaxxxxxxxxbbbb"],
	}),
	makeCustomerProduct({
		id: "seats",
		productName: "Seats",
		subscriptionIds: ["sub_entity"],
		entityId: "ent_1",
	}),
	makeCustomerProduct({
		id: "next",
		productName: "Enterprise",
		scheduledIds: ["sub_sched_future"],
		status: CusProductStatus.Scheduled,
	}),
	makeCustomerProduct({ id: "free", productName: "Free", isFree: true }),
];

const buildRows = (proposals: ReturnType<typeof makeProposal>[]) =>
	buildSubscriptionPickerRows({ proposals, customerProducts, entities });

describe("buildSubscriptionPickerRows", () => {
	test("lists every linked subscription and schedule from the plans alone, before Stripe loads", () => {
		const rows = buildSubscriptionPickerRows({
			proposals: undefined,
			customerProducts,
			entities,
		});

		expect(
			rows.map((row) => [row.key, row.scopeName, row.planNames, row.stripe]),
		).toEqual([
			["sub_aaaaxxxxxxxxbbbb", "Customer-level", ["Pro", "Addon"], null],
			["sub_entity", "Acme Workspace", ["Seats"], null],
			["sub_sched_future", "Customer-level", ["Enterprise"], null],
		]);
	});

	test("lists only subscriptions Autumn bills plans on", () => {
		const rows = buildRows([
			makeProposal({
				subscription: makeStripeSubscription({ id: "sub_aaaaxxxxxxxxbbbb" }),
			}),
			makeProposal({
				subscription: makeStripeSubscription({ id: "sub_unlinked" }),
			}),
			makeProposal({
				subscription: makeStripeSubscription({ id: "sub_entity" }),
			}),
		]);

		expect(rows.map((row) => row.key)).toEqual([
			"sub_aaaaxxxxxxxxbbbb",
			"sub_entity",
			"sub_sched_future",
		]);
	});

	test("leaves out canceled and expired-incomplete subscriptions", () => {
		const rows = buildRows([
			makeProposal({
				subscription: makeStripeSubscription({
					id: "sub_aaaaxxxxxxxxbbbb",
					status: "canceled",
				}),
			}),
			makeProposal({
				subscription: makeStripeSubscription({
					id: "sub_entity",
					status: "incomplete_expired",
				}),
			}),
		]);

		expect(rows.map((row) => row.key)).toEqual(["sub_sched_future"]);
	});

	test("names the scope, plans and cadence of each subscription", () => {
		const [customerRow, entityRow] = buildRows([
			makeProposal({
				subscription: makeStripeSubscription({ id: "sub_aaaaxxxxxxxxbbbb" }),
			}),
			makeProposal({
				subscription: makeStripeSubscription({
					id: "sub_entity",
					interval: "year",
				}),
			}),
		]);

		expect(customerRow?.scopeName).toBe("Customer-level");
		expect(customerRow?.stripeObjectId).toBe("sub_aaaa…bbbb");
		expect(customerRow?.mainPlanName).toBe("Pro");
		expect(customerRow?.stripe?.cadence).toBe("Monthly");
		expect(customerRow?.planNames).toEqual(["Pro", "Addon"]);
		expect(entityRow?.scopeName).toBe("Acme Workspace");
		expect(entityRow?.stripeObjectId).toBe("sub_entity");
		expect(entityRow?.stripe?.cadence).toBe("Yearly");
		expect(entityRow?.planNames).toEqual(["Seats"]);
	});

	test("shows a not-started schedule as its own row", () => {
		const row = buildRows([
			makeProposal({
				schedule: makeStripeSchedule({ id: "sub_sched_future" }),
			}),
		]).find(({ key }) => key === "sub_sched_future");

		expect(row?.stripeSubscriptionId).toBeNull();
		expect(row?.stripeScheduleId).toBe("sub_sched_future");
		expect(row?.planNames).toEqual(["Enterprise"]);
		expect(row?.stripe?.status?.label).toBe("Not started");
		expect(row?.stripe?.renewal).toEqual({
			kind: "starts",
			date: PERIOD_END_SECONDS * 1000,
		});
	});

	test("leaves out a schedule Stripe has started, and never lists unlinked ones", () => {
		const rows = buildRows([
			makeProposal({
				schedule: makeStripeSchedule({
					id: "sub_sched_future",
					status: "released",
				}),
			}),
			makeProposal({ schedule: makeStripeSchedule({ id: "sub_sched_other" }) }),
		]);

		expect(rows.map((row) => row.key)).toEqual([
			"sub_aaaaxxxxxxxxbbbb",
			"sub_entity",
		]);
	});

	test("keeps broken subscriptions with their real status", () => {
		const row = buildRows([
			makeProposal({
				subscription: makeStripeSubscription({
					id: "sub_entity",
					status: "past_due",
				}),
			}),
		]).find(({ key }) => key === "sub_entity");

		expect(row?.stripe?.status).toEqual({ label: "Past due", tone: "bad" });
		expect(row?.stripe?.renewal.kind).toBe("payment_failed");
	});

	test("a cancelling subscription keeps its status and cancels in the renew column", () => {
		const row = buildRows([
			makeProposal({
				subscription: makeStripeSubscription({
					id: "sub_entity",
					cancelAtPeriodEnd: true,
				}),
			}),
		]).find(({ key }) => key === "sub_entity");

		expect(row?.stripe?.status?.label).toBe("Active");
		expect(row?.stripe?.renewal).toEqual({
			kind: "cancels",
			date: PERIOD_END_SECONDS * 1000,
		});
	});

	test("a picked row becomes a changeable target with its schedule", () => {
		const subscription = makeStripeSubscription({ id: "sub_aaaaxxxxxxxxbbbb" });
		const [row] = buildRows([
			makeProposal({
				subscription,
				schedule: makeStripeSchedule({ id: "sub_sched_a", status: "active" }),
			}),
		]);

		expect(row && subscriptionPickerRowToTarget({ row })).toEqual({
			key: "sub_aaaaxxxxxxxxbbbb",
			stripeSubscriptionId: "sub_aaaaxxxxxxxxbbbb",
			stripeScheduleId: "sub_sched_a",
			planName: "Pro",
			stripeObjectId: "sub_aaaa…bbbb",
			details: `Monthly · renews ${format(PERIOD_END_SECONDS * 1000, "MMM d, yyyy")}`,
			canChange: true,
		});
	});
});

describe("findUnlinkedFreePlanNames", () => {
	test("names free plans billed on no subscription", () => {
		expect(findUnlinkedFreePlanNames({ customerProducts })).toEqual(["Free"]);
	});

	test("ignores expired free plans", () => {
		expect(
			findUnlinkedFreePlanNames({
				customerProducts: [
					makeCustomerProduct({
						id: "old_free",
						productName: "Old Free",
						isFree: true,
						status: CusProductStatus.Expired,
					}),
				],
			}),
		).toEqual([]);
	});
});
