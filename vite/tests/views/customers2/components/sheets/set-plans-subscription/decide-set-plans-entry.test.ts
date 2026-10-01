import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { collectLinkedStripeObjectIds } from "@/views/customers2/components/sheets/set-plans-subscription/utils/collectLinkedStripeObjectIds";
import { decideSetPlansEntry } from "@/views/customers2/components/sheets/set-plans-subscription/utils/decideSetPlansEntry";
import { makeCustomerProduct } from "./setPlansSubscriptionFixtures";

const proOnSubscriptionA = makeCustomerProduct({
	id: "pro",
	productName: "Pro",
	subscriptionIds: ["sub_a"],
});
const seatsOnSubscriptionB = makeCustomerProduct({
	id: "seats",
	productName: "Seats",
	subscriptionIds: ["sub_b"],
	entityId: "ent_1",
});
const freePlan = makeCustomerProduct({
	id: "free",
	productName: "Free",
	isFree: true,
});

describe("collectLinkedStripeObjectIds", () => {
	test("collects each subscription a live plan bills on once", () => {
		const linkedIds = collectLinkedStripeObjectIds({
			customerProducts: [
				proOnSubscriptionA,
				makeCustomerProduct({
					id: "addon",
					productName: "Addon",
					subscriptionIds: ["sub_a"],
				}),
				seatsOnSubscriptionB,
				freePlan,
			],
		});

		expect(linkedIds.subscriptionIds).toEqual(["sub_a", "sub_b"]);
		expect(linkedIds.standaloneScheduleIds).toEqual([]);
	});

	test("ignores subscriptions only expired plans point at", () => {
		const linkedIds = collectLinkedStripeObjectIds({
			customerProducts: [
				proOnSubscriptionA,
				makeCustomerProduct({
					id: "old",
					productName: "Old",
					subscriptionIds: ["sub_old"],
					status: CusProductStatus.Expired,
				}),
			],
		});

		expect(linkedIds.subscriptionIds).toEqual(["sub_a"]);
	});

	test("counts a schedule no subscription owns as its own object", () => {
		const linkedIds = collectLinkedStripeObjectIds({
			customerProducts: [
				{ ...proOnSubscriptionA, scheduled_ids: ["sub_sched_a"] },
				makeCustomerProduct({
					id: "next",
					productName: "Next",
					scheduledIds: ["sub_sched_a"],
					status: CusProductStatus.Scheduled,
				}),
				makeCustomerProduct({
					id: "later",
					productName: "Later",
					scheduledIds: ["sub_sched_standalone"],
					status: CusProductStatus.Scheduled,
				}),
			],
		});

		expect(linkedIds.subscriptionIds).toEqual(["sub_a"]);
		expect(linkedIds.standaloneScheduleIds).toEqual(["sub_sched_standalone"]);
	});
});

describe("decideSetPlansEntry", () => {
	test("opens Set Plans directly with no target when nothing is linked", () => {
		expect(
			decideSetPlansEntry({ customerProducts: [freePlan], entityId: null }),
		).toEqual({ kind: "set_plans", subscriptionTarget: null });
	});

	test("opens Set Plans directly with no target for one subscription", () => {
		expect(
			decideSetPlansEntry({
				customerProducts: [proOnSubscriptionA, freePlan],
				entityId: null,
			}),
		).toEqual({ kind: "set_plans", subscriptionTarget: null });
	});

	test("asks for a subscription when two are linked", () => {
		expect(
			decideSetPlansEntry({
				customerProducts: [proOnSubscriptionA, seatsOnSubscriptionB],
				entityId: null,
			}),
		).toEqual({ kind: "choose_subscription" });
	});

	test("on an entity page with one entity subscription, targets it", () => {
		const entry = decideSetPlansEntry({
			customerProducts: [
				proOnSubscriptionA,
				{ ...seatsOnSubscriptionB, scheduled_ids: ["sub_sched_b"] },
			],
			entityId: "ent_1",
		});

		expect(entry).toEqual({
			kind: "set_plans",
			subscriptionTarget: {
				key: "sub_b",
				stripeSubscriptionId: "sub_b",
				stripeScheduleId: "sub_sched_b",
				label: "sub_b",
				canChange: false,
			},
		});
	});

	test("on an entity page with no entity subscription, opens without a target", () => {
		expect(
			decideSetPlansEntry({
				customerProducts: [proOnSubscriptionA, seatsOnSubscriptionB],
				entityId: "ent_2",
			}),
		).toEqual({ kind: "set_plans", subscriptionTarget: null });
	});

	test("on an entity page whose plans span two subscriptions, asks", () => {
		expect(
			decideSetPlansEntry({
				customerProducts: [
					proOnSubscriptionA,
					seatsOnSubscriptionB,
					makeCustomerProduct({
						id: "extra",
						productName: "Extra",
						subscriptionIds: ["sub_c"],
						entityId: "ent_1",
					}),
				],
				entityId: "ent_1",
			}),
		).toEqual({ kind: "choose_subscription" });
	});
});
