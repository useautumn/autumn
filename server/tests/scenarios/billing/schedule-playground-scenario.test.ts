import { expect, test } from "bun:test";
import { BillingInterval, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getFullCustomerSchedule } from "@/internal/customers/cusUtils/getFullCustomerSchedule";

type Usage = "credits" | "messages" | "words";

const usageItem = (usage: Usage, included: number) =>
	usage === "messages"
		? itemsV2.monthlyMessages({ included })
		: usage === "words"
			? itemsV2.monthlyWords({ included })
			: itemsV2.monthlyCredits({ included });

const catalogPlan = ({
	id,
	name,
	price,
	usage,
	included,
	isAddOn = false,
}: {
	id: string;
	name: string;
	price: number;
	usage: Usage;
	included: number;
	isAddOn?: boolean;
}) => ({
	...products.base({
		id,
		group: isAddOn ? undefined : id,
		isAddOn,
		items: [
			items.monthlyPrice({ price }),
			usage === "messages"
				? items.monthlyMessages({ includedUsage: included })
				: usage === "words"
					? items.monthlyWords({ includedUsage: included })
					: items.monthlyCredits({ includedUsage: included }),
		],
	}),
	name,
});

const customizedPlan = ({
	amount,
	included,
	plan_id,
	usage,
}: {
	amount: number;
	included: number;
	plan_id: string;
	usage: Usage;
}) => ({
	customize: {
		items: [usageItem(usage, included)],
		price: { amount, interval: BillingInterval.Month },
	},
	plan_id,
});

test("scenario: complex attached schedule playground", async () => {
	const plans = [
		catalogPlan({
			id: "schedule-core",
			name: "Core",
			price: 1_000,
			usage: "messages",
			included: 10_000,
		}),
		catalogPlan({
			id: "schedule-analytics-addon",
			name: "Analytics Add-on",
			price: 200,
			usage: "words",
			included: 5_000,
			isAddOn: true,
		}),
		catalogPlan({
			id: "schedule-support-addon",
			name: "Support Add-on",
			price: 300,
			usage: "credits",
			included: 50,
			isAddOn: true,
		}),
		catalogPlan({
			id: "schedule-success-addon",
			name: "Success Add-on",
			price: 100,
			usage: "credits",
			included: 25,
			isAddOn: true,
		}),
	];
	const phaseTerms = [
		{
			core: 900,
			messages: 12_000,
			analytics: 175,
			reports: 5_000,
			support: 225,
			tickets: 25,
		},
		{
			core: 1_100,
			messages: 20_000,
			analytics: 190,
			reports: 7_500,
			support: 250,
			tickets: 50,
		},
		{
			core: 1_350,
			messages: 30_000,
			analytics: 200,
			reports: 9_000,
			support: 275,
			tickets: 75,
		},
		{
			core: 1_500,
			messages: 40_000,
			analytics: 225,
			reports: 10_000,
			support: 300,
			tickets: 100,
		},
	];
	const customerId = "schedule-playground-customer";
	const { autumnV1, ctx, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({
				name: "Schedule Test Customer",
				paymentMethod: "success",
				testClock: false,
			}),
			s.products({ list: plans, prefix: "" }),
		],
		actions: [],
	});
	const now = Date.now();
	const response = await autumnV1.billing.createSchedule({
		billing_behavior: "none",
		billing_cycle_anchor: "now",
		customer_id: customerId,
		phases: phaseTerms.map((terms, index) => ({
			...(index % 2 ? { billing_cycle_anchor: "phase_start" as const } : {}),
			plans: [
				customizedPlan({
					amount: terms.core,
					included: terms.messages,
					plan_id: "schedule-core",
					usage: "messages",
				}),
				customizedPlan({
					amount: terms.analytics,
					included: terms.reports,
					plan_id: "schedule-analytics-addon",
					usage: "words",
				}),
				customizedPlan({
					amount: terms.support,
					included: terms.tickets,
					plan_id: "schedule-support-addon",
					usage: "credits",
				}),
			],
			starts_at: now + ms.days(index * 365),
		})),
		unscheduled_plans: [
			customizedPlan({
				amount: 95,
				included: 25,
				plan_id: "schedule-success-addon",
				usage: "credits",
			}),
		],
	});

	expect(
		response.phases.map((phase) => phase.customer_product_ids.length),
	).toEqual([3, 3, 3, 3]);
	const persisted = await getFullCustomerSchedule({
		ctx,
		internalCustomerId: customer.internal_id,
	});
	expect(
		persisted?.phases.map((phase) => phase.customer_product_ids.length),
	).toEqual([3, 3, 3, 3]);
});
