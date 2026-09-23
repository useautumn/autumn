import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type SyncProposalV2,
} from "@autumn/shared";
import { syncProposalToCustomerState } from "@/views/customers2/components/sync-stripe-v2/syncProposalToCustomerState";

const STRIPE_SUBSCRIPTION_ID = "sub_past_due";

const linkedCustomerProduct = ({
	status,
}: {
	status: CusProductStatus;
}): FullCusProduct =>
	({
		id: "cus_prod_credits",
		status,
		subscription_ids: [STRIPE_SUBSCRIPTION_ID],
		scheduled_ids: [],
		internal_entity_id: "ety_seat_1",
		entity_id: null,
		ended_at: null,
		starts_at: 0,
		quantity: 1,
		is_custom: false,
		options: [],
		customer_entitlements: [],
		customer_prices: [],
		product_id: "credits",
		product: { id: "credits", version: 1 },
	}) as unknown as FullCusProduct;

const toCurrentPlans = ({ status }: { status: CusProductStatus }) =>
	syncProposalToCustomerState({
		proposal: {
			stripe_subscription_id: STRIPE_SUBSCRIPTION_ID,
			stripe_schedule_id: null,
			phases: [{ starts_at: "now", plans: [] }],
		} as unknown as SyncProposalV2,
		customerProducts: [linkedCustomerProduct({ status })],
		entities: [{ id: "seat_1", internal_id: "ety_seat_1" } as Entity],
		contextEntityId: null,
		products: [],
		features: [],
	}).phases[0]?.plans.map(({ productId, entityId }) => ({
		productId,
		entityId,
	}));

test("a past-due linked plan stays in the current phase on its entity", () => {
	expect(toCurrentPlans({ status: CusProductStatus.PastDue })).toEqual([
		{ productId: "credits", entityId: "seat_1" },
	]);
});

test("an active linked plan stays in the current phase on its entity", () => {
	expect(toCurrentPlans({ status: CusProductStatus.Active })).toEqual([
		{ productId: "credits", entityId: "seat_1" },
	]);
});
