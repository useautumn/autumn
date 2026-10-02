import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";
import { findSubscriptionConflict } from "@/components/forms/customer-state/utils/findSubscriptionConflict";

const PAID_PRICE = {
	price: { config: { type: "fixed", amount: 20, interval: "month" } },
};

const product = ({
	id,
	isAddOn = false,
	group = "main",
}: {
	id: string;
	isAddOn?: boolean;
	group?: string;
}) =>
	({
		id,
		name: id,
		is_add_on: isAddOn,
		group,
		items: [],
	}) as unknown as ProductV2;

const onSubscription = ({
	plan,
	stripeSubscriptionId,
}: {
	plan: ProductV2;
	stripeSubscriptionId: string;
}) =>
	({
		id: `cp_${plan.id}`,
		status: CusProductStatus.Active,
		subscription_ids: [stripeSubscriptionId],
		scheduled_ids: [],
		entity_id: null,
		internal_entity_id: null,
		customer_prices: [PAID_PRICE],
		customer_licenses: [],
		product: {
			id: plan.id,
			name: plan.id,
			is_add_on: plan.is_add_on,
			group: plan.group,
		},
	}) as unknown as FullCusProduct;

const pro = product({ id: "Pro" });
const seats = product({ id: "Seats", isAddOn: true, group: "" });
const customerProducts = [
	onSubscription({ plan: pro, stripeSubscriptionId: "sub_a" }),
	onSubscription({ plan: seats, stripeSubscriptionId: "sub_b" }),
];

const conflictWhileEditingB = (requested: ProductV2) =>
	findSubscriptionConflict({
		customerProducts,
		entities: [],
		stripeSubscriptionId: "sub_b",
		stripeScheduleId: null,
		product: requested,
		entityId: null,
	});

test("a main plan whose group is live on another subscription conflicts, naming that subscription", () => {
	expect(conflictWhileEditingB(product({ id: "Free" }))).toEqual({
		conflict: "replaces",
		conflictingPlanName: "Pro",
		stripeSubscriptionId: "sub_a",
		subscriptionPlanName: "Pro",
	});
});

test("the same plan billed on another subscription conflicts", () => {
	expect(conflictWhileEditingB(pro)).toEqual({
		conflict: "already_billed",
		conflictingPlanName: "Pro",
		stripeSubscriptionId: "sub_a",
		subscriptionPlanName: "Pro",
	});
});

test("add-ons and plans in other groups don't conflict, and nothing does without a target", () => {
	expect([
		conflictWhileEditingB(product({ id: "Credits", isAddOn: true, group: "" })),
		conflictWhileEditingB(product({ id: "Support", group: "support" })),
		findSubscriptionConflict({
			customerProducts,
			entities: [],
			stripeSubscriptionId: null,
			stripeScheduleId: null,
			product: product({ id: "Free" }),
			entityId: null,
		}),
	]).toEqual([null, null, null]);
});

test("a different plan sharing the live plan's name still reads as replacing it", () => {
	const renamedPro = { ...product({ id: "pro_v2" }), name: "Pro" } as ProductV2;

	expect(conflictWhileEditingB(renamedPro)?.conflict).toBe("replaces");
});

test("one-off plans attach across subscriptions, so they never conflict", () => {
	const oneOffPro = {
		...pro,
		items: [{ feature_id: null, price: 50, interval: null }],
	} as unknown as ProductV2;

	expect(conflictWhileEditingB(oneOffPro)).toBeNull();
});
