import { expect, test } from "bun:test";
import {
	AppEnv,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerSchedule,
	type ProductV2,
} from "@autumn/shared";
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
	billingCycleAnchorResetsAt = null,
}: {
	id: string;
	productId: string;
	status: CusProductStatus;
	startsAt: number;
	endedAt?: number | null;
	internalEntityId: string;
	billingCycleAnchorResetsAt?: number | null;
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
		billing_cycle_anchor_resets_at: billingCycleAnchorResetsAt,
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

const scheduleWithPhases = (
	phases: { startsAt: number; customerProductIds: string[] }[],
) =>
	({
		id: "sch_1",
		phases: phases.map(({ startsAt, customerProductIds }, index) => ({
			id: `sch_phase_${index}`,
			schedule_id: "sch_1",
			starts_at: startsAt,
			customer_product_ids: customerProductIds,
			proration_behavior: null,
		})),
	}) as unknown as FullCustomerSchedule;

const customerWith = ({
	nextResetsCycle,
}: {
	nextResetsCycle: boolean;
}): FullCustomer =>
	({
		internal_id: "int_cus",
		id: "cus",
		env: AppEnv.Sandbox,
		entities: [{ id: "main", internal_id: "ety_main" }],
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
				id: "cp_next",
				productId: "enterprise",
				status: CusProductStatus.Scheduled,
				startsAt: NEXT_PHASE,
				internalEntityId: "ety_main",
				billingCycleAnchorResetsAt: nextResetsCycle ? NEXT_PHASE : null,
			}),
		],
	}) as unknown as FullCustomer;

const customer = customerWith({ nextResetsCycle: true });

test("a saved phase that repeats the one before it reopens as its own phase", () => {
	const form = buildInitialValues({
		customer,
		products: [plan("enterprise")],
		nowMs: NOW,
		schedules: [
			scheduleWithPhases([
				{ startsAt: PHASE_START, customerProductIds: ["cp_now"] },
				{ startsAt: NEXT_PHASE, customerProductIds: ["cp_next"] },
				{ startsAt: LATER_PHASE, customerProductIds: ["cp_next"] },
			]),
		],
	});

	expect(form.phases.map((phase) => phase.startsAt)).toEqual([
		PHASE_START,
		NEXT_PHASE,
		LATER_PHASE,
	]);
	expect(form.phases[2]?.keepsCycleAnchor).toBe(false);
	expect(
		form.phases.map((phase) =>
			phase.plans.map(({ productId, entityId }) => ({ productId, entityId })),
		),
	).toEqual([
		[{ productId: "enterprise", entityId: "main" }],
		[{ productId: "enterprise", entityId: "main" }],
		[{ productId: "enterprise", entityId: "main" }],
	]);
});

test("a saved phase holding none of the scoped plans adds no phase", () => {
	const form = buildInitialValues({
		customer,
		products: [plan("enterprise")],
		nowMs: NOW,
		schedules: [
			scheduleWithPhases([
				{ startsAt: LATER_PHASE, customerProductIds: ["cp_other"] },
			]),
		],
	});

	expect(form.phases.map((phase) => phase.startsAt)).toEqual([
		PHASE_START,
		NEXT_PHASE,
	]);
});

test("a repeated phase reopens with the anchor of the phase it repeats", () => {
	const form = buildInitialValues({
		customer: customerWith({ nextResetsCycle: false }),
		products: [plan("enterprise")],
		nowMs: NOW,
		schedules: [
			scheduleWithPhases([
				{ startsAt: NEXT_PHASE, customerProductIds: ["cp_next"] },
				{ startsAt: LATER_PHASE, customerProductIds: ["cp_next"] },
			]),
		],
	});

	expect(form.phases.map((phase) => phase.keepsCycleAnchor)).toEqual([
		false,
		true,
		true,
	]);
});

test("a repeated phase hours after another boundary still reopens", () => {
	const sameDay = NEXT_PHASE + 12 * 60 * 60 * 1000;
	const form = buildInitialValues({
		customer,
		products: [plan("enterprise")],
		nowMs: NOW,
		schedules: [
			scheduleWithPhases([
				{ startsAt: NEXT_PHASE, customerProductIds: ["cp_next"] },
				{ startsAt: sameDay, customerProductIds: ["cp_next"] },
			]),
		],
	});

	expect(form.phases.map((phase) => phase.startsAt)).toEqual([
		PHASE_START,
		NEXT_PHASE,
		sameDay,
	]);
});

test("a repeated phase reopens with the plans it saved, not the nearest scheduled plan", () => {
	const noon = NEXT_PHASE + 12 * 60 * 60 * 1000;
	const evening = NEXT_PHASE + 18 * 60 * 60 * 1000;
	const nearbyCustomer = {
		...customer,
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
				id: "cp_next",
				productId: "enterprise",
				status: CusProductStatus.Scheduled,
				startsAt: NEXT_PHASE,
				endedAt: evening,
				internalEntityId: "ety_main",
			}),
			row({
				id: "cp_evening",
				productId: "premium",
				status: CusProductStatus.Scheduled,
				startsAt: evening,
				internalEntityId: "ety_main",
			}),
		],
	} as unknown as FullCustomer;

	const form = buildInitialValues({
		customer: nearbyCustomer,
		products: [plan("enterprise"), plan("premium")],
		nowMs: NOW,
		schedules: [
			scheduleWithPhases([
				{ startsAt: NEXT_PHASE, customerProductIds: ["cp_next"] },
				{ startsAt: noon, customerProductIds: ["cp_next"] },
				{ startsAt: evening, customerProductIds: ["cp_evening"] },
			]),
		],
	});

	expect(
		form.phases.map((phase) => ({
			startsAt: phase.startsAt,
			plans: phase.plans.map(({ productId }) => productId),
		})),
	).toEqual([
		{ startsAt: PHASE_START, plans: ["enterprise"] },
		{ startsAt: NEXT_PHASE, plans: ["enterprise"] },
		{ startsAt: noon, plans: ["enterprise"] },
		{ startsAt: evening, plans: ["premium"] },
	]);
});
