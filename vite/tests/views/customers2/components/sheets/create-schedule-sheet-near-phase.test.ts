import { expect, test } from "bun:test";
import {
	AppEnv,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type ProductV2,
} from "@autumn/shared";
import { buildCreateScheduleRequestBody } from "@/components/forms/create-schedule/hooks/useCreateScheduleRequestBody";
import { buildInitialValues } from "@/views/customers2/components/sheets/CreateScheduleSheet";

const NOW = Date.UTC(2026, 9, 2, 9, 13);
const PHASE_START = Date.UTC(2026, 8, 30, 15, 33);
const NEXT_PHASE = Date.UTC(2026, 9, 3);
const LATER_PHASE = Date.UTC(2027, 9, 3);

const plan = (id: string): ProductV2 => ({
	id,
	name: id,
	is_add_on: false,
	is_default: false,
	version: 1,
	group: null,
	env: AppEnv.Sandbox,
	items: [],
	created_at: 0,
});

const row = ({
	id,
	productId,
	status,
	startsAt,
	endedAt = null,
	internalEntityId,
}: {
	id: string;
	productId: string;
	status: CusProductStatus;
	startsAt: number;
	endedAt?: number | null;
	internalEntityId: string;
}) =>
	({
		id,
		product_id: productId,
		internal_product_id: `int_${productId}`,
		internal_customer_id: "int_cus",
		customer_id: "cus",
		internal_entity_id: internalEntityId,
		status,
		starts_at: startsAt,
		ended_at: endedAt,
		canceled_at: null,
		is_custom: false,
		options: [],
		customer_prices: [],
		customer_entitlements: [],
		subscription_ids: ["sub_1"],
		scheduled_ids: ["sched_1"],
		product: {
			id: productId,
			name: productId,
			internal_id: `int_${productId}`,
		},
	}) as unknown as FullCusProduct;

test("a saved phase starting within a day of now is kept in the form and the request", () => {
	const customer = {
		internal_id: "int_cus",
		id: "cus",
		env: AppEnv.Sandbox,
		entities: [
			{ id: "main", internal_id: "ety_main" },
			{ id: "docs", internal_id: "ety_docs" },
		],
		customer_products: [
			row({
				id: "cp_now",
				productId: "enterprise",
				status: CusProductStatus.Active,
				startsAt: PHASE_START,
				endedAt: NEXT_PHASE,
				internalEntityId: "ety_main",
			}),
			row({
				id: "cp_docs",
				productId: "enterprise",
				status: CusProductStatus.Active,
				startsAt: PHASE_START,
				internalEntityId: "ety_docs",
			}),
			row({
				id: "cp_next",
				productId: "enterprise",
				status: CusProductStatus.Scheduled,
				startsAt: NEXT_PHASE,
				endedAt: LATER_PHASE,
				internalEntityId: "ety_main",
			}),
			row({
				id: "cp_later",
				productId: "enterprise",
				status: CusProductStatus.Scheduled,
				startsAt: LATER_PHASE,
				internalEntityId: "ety_main",
			}),
		],
	} as unknown as FullCustomer;
	const products = [plan("enterprise")];

	const form = buildInitialValues({ customer, products, nowMs: NOW });
	expect(form.phases.map((phase) => phase.startsAt)).toEqual([
		PHASE_START,
		NEXT_PHASE,
		LATER_PHASE,
	]);

	const body = buildCreateScheduleRequestBody({
		customerId: "cus",
		phases: form.phases,
		unscheduledPlans: form.unscheduledPlans,
		products,
		features: [],
		nowMs: NOW,
	});
	expect(body?.phases.map((phase) => phase.starts_at)).toEqual([
		PHASE_START,
		NEXT_PHASE,
		LATER_PHASE,
	]);
});
