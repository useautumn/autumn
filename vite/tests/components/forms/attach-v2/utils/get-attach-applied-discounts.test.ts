import { describe, expect, test } from "bun:test";
import {
	type ApiDiscount,
	BillingInterval,
	CouponDurationType,
	CusProductStatus,
	type FullCustomer,
	PriceType,
	type ProductV2,
	RewardType,
} from "@autumn/shared";
import { getAttachAppliedDiscounts } from "@/components/forms/attach-v2/utils/getAttachAppliedDiscounts";

const paidCustomerProduct = ({
	id,
	productId,
	group,
	subscriptionId,
	isAddOn = false,
	internalEntityId = null,
}: {
	id: string;
	productId: string;
	group: string;
	subscriptionId: string;
	isAddOn?: boolean;
	internalEntityId?: string | null;
}) => ({
	id,
	status: CusProductStatus.Active,
	subscription_ids: [subscriptionId],
	internal_entity_id: internalEntityId,
	product: { id: productId, group, is_add_on: isAddOn },
	customer_prices: [
		{
			price: {
				config: {
					type: PriceType.Fixed,
					amount: 20,
					interval: BillingInterval.Month,
				},
			},
		},
	],
	customer_entitlements: [],
});

const discount = ({
	id,
	subscriptionId,
}: {
	id: string;
	subscriptionId: string | null;
}): ApiDiscount => ({
	id,
	name: id,
	type: RewardType.PercentageDiscount,
	discount_value: 10,
	duration_type: CouponDurationType.Forever,
	subscription_id: subscriptionId,
});

const buildCustomer = (customerProducts: unknown[]) =>
	({
		customer_products: customerProducts,
		entities: [{ id: "workspace_1", internal_id: "ent_internal_1" }],
	}) as unknown as FullCustomer;

const recurringProduct = (overrides: Partial<ProductV2> = {}) =>
	({
		id: "premium",
		group: "main",
		is_add_on: false,
		items: [{ price: 50, interval: BillingInterval.Month, feature_id: null }],
		...overrides,
	}) as ProductV2;

const discounts = [
	discount({ id: "launch_30", subscriptionId: "sub_main" }),
	discount({ id: "addon_5", subscriptionId: "sub_addon" }),
	discount({ id: "customer_wide", subscriptionId: null }),
];

describe("getAttachAppliedDiscounts", () => {
	test("returns the discounts on the subscription the plan will join", () => {
		const customer = buildCustomer([
			paidCustomerProduct({
				id: "cp_addon",
				productId: "seats",
				group: "addons",
				subscriptionId: "sub_addon",
				isAddOn: true,
			}),
			paidCustomerProduct({
				id: "cp_main",
				productId: "pro",
				group: "main",
				subscriptionId: "sub_main",
			}),
		]);

		expect(
			getAttachAppliedDiscounts({
				customer,
				entityId: undefined,
				product: recurringProduct(),
				newBillingSubscription: false,
				discounts,
			}).map(({ id }) => id),
		).toEqual(["launch_30"]);
	});

	test("falls back to customer-level discounts when the plan starts a new subscription", () => {
		const customer = buildCustomer([
			paidCustomerProduct({
				id: "cp_main",
				productId: "pro",
				group: "main",
				subscriptionId: "sub_main",
			}),
		]);

		expect(
			getAttachAppliedDiscounts({
				customer,
				entityId: undefined,
				product: recurringProduct(),
				newBillingSubscription: true,
				discounts,
			}).map(({ id }) => id),
		).toEqual(["customer_wide"]);
	});

	test("falls back to customer-level discounts when the target subscription has none", () => {
		const customer = buildCustomer([
			paidCustomerProduct({
				id: "cp_main",
				productId: "pro",
				group: "main",
				subscriptionId: "sub_undiscounted",
			}),
		]);

		expect(
			getAttachAppliedDiscounts({
				customer,
				entityId: undefined,
				product: recurringProduct(),
				newBillingSubscription: false,
				discounts,
			}).map(({ id }) => id),
		).toEqual(["customer_wide"]);
	});

	test("prefers the selected entity's subscription", () => {
		const customer = buildCustomer([
			paidCustomerProduct({
				id: "cp_main",
				productId: "pro",
				group: "main",
				subscriptionId: "sub_main",
			}),
			paidCustomerProduct({
				id: "cp_entity",
				productId: "seats",
				group: "addons",
				subscriptionId: "sub_addon",
				internalEntityId: "ent_internal_1",
			}),
		]);

		expect(
			getAttachAppliedDiscounts({
				customer,
				entityId: "workspace_1",
				product: recurringProduct(),
				newBillingSubscription: false,
				discounts,
			}).map(({ id }) => id),
		).toEqual(["addon_5"]);
	});
});
