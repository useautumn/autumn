import { describe, expect, test } from "bun:test";
import {
	CollectionMethod,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type StripeBillingPlan,
} from "@autumn/shared";
import { handleRestoreErrors } from "@/internal/billing/v2/actions/restore/errors/handleRestoreErrors";

const SUB_ID = "sub_test";
const NOW = 1_710_000_000_000;
const PERIOD_END = NOW + 30 * 24 * 60 * 60 * 1000;

const makeCustomerProduct = ({
	id,
	productId,
	status = CusProductStatus.Active,
	internalEntityId = null,
	group = "main",
	endedAt = null,
}: {
	id: string;
	productId: string;
	status?: CusProductStatus;
	internalEntityId?: string | null;
	group?: string;
	endedAt?: number | null;
}): FullCusProduct =>
	({
		id,
		product_id: productId,
		internal_product_id: `internal_${productId}`,
		internal_customer_id: "internal_cus_test",
		customer_id: "cus_test",
		internal_entity_id: internalEntityId,
		status,
		starts_at: status === CusProductStatus.Scheduled ? PERIOD_END : NOW,
		ended_at: endedAt,
		canceled: false,
		canceled_at: null,
		subscription_ids: [SUB_ID],
		scheduled_ids: [],
		collection_method: CollectionMethod.ChargeAutomatically,
		options: [],
		quantity: 1,
		customer_prices: [],
		customer_entitlements: [],
		product: { id: productId, group, is_add_on: false },
	}) as unknown as FullCusProduct;

const runGuard = (customerProducts: FullCusProduct[]) =>
	handleRestoreErrors({
		stripeBillingPlan: {} as StripeBillingPlan,
		stripeSubscriptionId: SUB_ID,
		fullCustomer: {
			id: "cus_test",
			customer_products: customerProducts,
		} as unknown as FullCustomer,
	});

describe("restore guard: active plan with a scheduled successor needs ended_at", () => {
	test("throws when the same entity's predecessor is open-ended", () => {
		expect(() =>
			runGuard([
				makeCustomerProduct({
					id: "cp_premium",
					productId: "premium",
					internalEntityId: "ent_1",
				}),
				makeCustomerProduct({
					id: "cp_pro_scheduled",
					productId: "pro",
					status: CusProductStatus.Scheduled,
					internalEntityId: "ent_1",
				}),
			]),
		).toThrow(/cp_premium .* has no ended_at/);
	});

	test("throws for a customer-level phased sub imported without ended_at", () => {
		expect(() =>
			runGuard([
				makeCustomerProduct({ id: "cp_phase_1", productId: "pro" }),
				makeCustomerProduct({
					id: "cp_phase_2",
					productId: "premium",
					status: CusProductStatus.Scheduled,
				}),
			]),
		).toThrow(/cp_phase_1 .* has no ended_at/);
	});

	test("ignores another entity's open-ended plan on the shared subscription", () => {
		expect(() =>
			runGuard([
				makeCustomerProduct({
					id: "cp_pro_ent_0",
					productId: "pro",
					internalEntityId: "ent_0",
				}),
				makeCustomerProduct({
					id: "cp_premium_ent_1",
					productId: "premium",
					internalEntityId: "ent_1",
					endedAt: PERIOD_END,
				}),
				makeCustomerProduct({
					id: "cp_pro_ent_1_scheduled",
					productId: "pro",
					status: CusProductStatus.Scheduled,
					internalEntityId: "ent_1",
				}),
			]),
		).not.toThrow();
	});

	test("ignores an open-ended plan in a different product group", () => {
		expect(() =>
			runGuard([
				makeCustomerProduct({
					id: "cp_support",
					productId: "support",
					group: "support",
				}),
				makeCustomerProduct({
					id: "cp_premium",
					productId: "premium",
					endedAt: PERIOD_END,
				}),
				makeCustomerProduct({
					id: "cp_pro_scheduled",
					productId: "pro",
					status: CusProductStatus.Scheduled,
				}),
			]),
		).not.toThrow();
	});
});
