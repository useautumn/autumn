import { describe, expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { buildCreateScheduleRequestBody } from "../hooks/useCreateScheduleRequestBody";
import { scheduleFormFromRequestBody } from "./scheduleFormFromRequestBody";

describe("scheduleFormFromRequestBody", () => {
	test("maps phases, plans, and top-level flags", () => {
		const form = scheduleFormFromRequestBody({
			proration_behavior: "none",
			billing_cycle_anchor: "now",
			customer_id: "cus_1",
			enable_plan_immediately: true,
			phases: [
				{
					plans: [
						{
							feature_quantities: [{ feature_id: "seats", quantity: 5 }],
							items: [{ feature_id: null, interval: "month", price: 1000 }],
							plan_id: "scale",
						},
					],
					starts_at: "now",
				},
				{
					plans: [{ plan_id: "enterprise", version: 2 }],
					starts_at: 1790000000000,
				},
			],
			unscheduled_plans: [{ plan_id: "support-addon" }],
		});
		expect(form).toMatchObject({
			enablePlanImmediately: true,
			resetBillingCycle: true,
			unscheduledPlans: [
				{ isCustom: false, items: null, productId: "support-addon" },
			],
		});
		expect(form?.phases).toHaveLength(2);
		expect(form?.phases?.[0]).toMatchObject({
			plans: [
				{
					isCustom: true,
					items: [{ feature_id: null, interval: "month", price: 1000 }],
					prepaidOptions: { seats: 5 },
					productId: "scale",
				},
			],
			prorationBehavior: "none",
			startsAt: null,
		});
		expect(form?.phases?.[1]).toMatchObject({
			plans: [{ productId: "enterprise", version: 2 }],
			startsAt: 1790000000000,
		});
	});

	test("folds starting_after offsets from the prior phase", () => {
		const form = scheduleFormFromRequestBody({
			phases: [
				{ plans: [{ plan_id: "launch" }], starts_at: 1780000000000 },
				{
					plans: [{ plan_id: "scale" }],
					starting_after: { duration_count: 2, duration_type: "month" },
				},
			],
		});
		const second = form?.phases?.[1]?.startsAt;
		expect(typeof second).toBe("number");
		expect(second).toBeGreaterThan(1780000000000);
	});

	test("round trips each phase's proration: the first through the request, later ones per phase", () => {
		const now = Date.UTC(2027, 0, 1);
		const product = { id: "pro", items: [] } as unknown as ProductV2;
		const request = {
			customer_id: "cus_1",
			proration_behavior: "none",
			phases: [
				{ plans: [{ plan_id: "pro" }], starts_at: now },
				{
					plans: [{ plan_id: "pro" }],
					starts_at: Date.UTC(2027, 2, 1),
					proration_behavior: "prorate_immediately",
				},
				{ plans: [{ plan_id: "pro" }], starts_at: Date.UTC(2027, 4, 1) },
			],
		};
		const form = scheduleFormFromRequestBody(request);
		expect(form?.phases?.map((phase) => phase.prorationBehavior)).toEqual([
			"none",
			"prorate_immediately",
			null,
		]);

		const rebuilt = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			phases: form?.phases ?? [],
			products: [product],
			features: [],
			nowMs: now,
		});
		expect(rebuilt?.proration_behavior).toBe("none");
		expect(rebuilt?.phases[0]).not.toHaveProperty("proration_behavior");
		expect(rebuilt?.phases[1]?.proration_behavior).toBe("prorate_immediately");
		expect(rebuilt?.phases[2]).not.toHaveProperty("proration_behavior");
	});

	test("returns undefined without phases", () => {
		expect(
			scheduleFormFromRequestBody({ customer_id: "cus_1" }),
		).toBeUndefined();
	});

	test("round trips generated custom items into schedule API customize params", () => {
		const now = Date.UTC(2027, 0, 1);
		const form = scheduleFormFromRequestBody({
			phases: [
				{ plans: [{ plan_id: "generation", version: 2 }], starts_at: now },
				{
					plans: [
						{
							items: [{ feature_id: null, interval: "month", price: 25 }],
							plan_id: "generation",
							version: 3,
						},
					],
					starts_at: now + 1,
				},
			],
		});
		const request = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			features: [],
			nowMs: now,
			phases: form?.phases ?? [],
			products: [{ id: "generation", items: [] } as unknown as ProductV2],
		});

		expect(request?.phases[1]?.plans[0]).toMatchObject({
			customize: { price: { amount: 25, interval: "month" } },
			plan_id: "generation",
			version: 3,
		});
	});

	test("round trips per-phase license quantities", () => {
		const now = Date.UTC(2027, 0, 1);
		const form = scheduleFormFromRequestBody({
			phases: [
				{
					plans: [
						{
							license_quantities: [{ license_plan_id: "seat", quantity: 25 }],
							plan_id: "gateway",
						},
					],
					starts_at: now,
				},
				{
					plans: [
						{
							license_quantities: [{ license_plan_id: "seat", quantity: 50 }],
							plan_id: "gateway",
						},
					],
					starts_at: now + 1,
				},
			],
		});
		const request = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			features: [],
			nowMs: now,
			phases: form?.phases ?? [],
			products: [{ id: "gateway", items: [] } as unknown as ProductV2],
		});

		expect(
			request?.phases.map((phase) => phase.plans[0]?.license_quantities),
		).toEqual([
			[{ license_plan_id: "seat", quantity: 25 }],
			[{ license_plan_id: "seat", quantity: 50 }],
		]);
	});

	test("preserves persisted phase identity after a generated edit", () => {
		const startsAt = Date.UTC(2027, 0, 1);
		const previousPhases = [0, 1].map((index) => ({
			persistedStartsAt: startsAt + index,
			plans: [],
			startsAt: startsAt + index,
		}));
		const form = scheduleFormFromRequestBody(
			{
				phases: previousPhases.map((phase) => ({
					plans: [{ plan_id: "generation", version: 2 }],
					starts_at: phase.startsAt,
				})),
			},
			previousPhases,
		);

		expect(
			form?.phases?.map(({ persistedStartsAt }) => persistedStartsAt),
		).toEqual([startsAt, startsAt + 1]);
	});

	test("keeps the active phase start when generation tries to move it", () => {
		const startsAt = Date.now() - 1_000;
		const form = scheduleFormFromRequestBody(
			{
				phases: [
					{
						plans: [{ plan_id: "generation", version: 2 }],
						starts_at: startsAt + 1,
					},
				],
			},
			[{ persistedStartsAt: startsAt, plans: [], startsAt }],
		);

		expect(form?.phases?.[0]).toMatchObject({
			persistedStartsAt: startsAt,
			startsAt,
		});
	});

	test("keeps future phase identity without discarding its generated start", () => {
		const now = Date.UTC(2027, 0, 1);
		const persistedStartsAt = now + 1_000;
		const generatedStartsAt = now + 2_000;
		const form = scheduleFormFromRequestBody(
			{
				phases: [
					{
						plans: [{ plan_id: "generation", version: 2 }],
						starts_at: generatedStartsAt,
					},
				],
			},
			[{ persistedStartsAt, plans: [], startsAt: persistedStartsAt }],
		);
		const request = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			features: [],
			nowMs: now,
			phases: form?.phases ?? [],
			products: [{ id: "generation", items: [] } as unknown as ProductV2],
		});

		expect(form?.phases?.[0]).toMatchObject({
			persistedStartsAt,
			startsAt: generatedStartsAt,
		});
		expect(request?.phases[0]?.starts_at).toBe(generatedStartsAt);
	});

	test("maps each later phase's billing cycle reset to its own keep cycle anchor", () => {
		const form = scheduleFormFromRequestBody({
			phases: [
				{ plans: [{ plan_id: "launch" }], starts_at: 1780000000000 },
				{
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: "scale" }],
					starts_at: 1790000000000,
				},
				{ plans: [{ plan_id: "enterprise" }], starts_at: 1800000000000 },
			],
		});

		expect(form?.resetBillingCycle).toBe(false);
		expect(form?.phases?.map((phase) => phase.keepsCycleAnchor)).toEqual([
			false,
			false,
			true,
		]);
	});

	test("round trips per-phase billing cycle resets unchanged", () => {
		const now = 1770000000000;
		const phases = [
			{ plans: [{ plan_id: "launch" }], starts_at: now },
			{ plans: [{ plan_id: "scale" }], starts_at: 1790000000000 },
			{
				billing_cycle_anchor: "phase_start",
				plans: [{ plan_id: "enterprise" }],
				starts_at: 1800000000000,
			},
		];
		const form = scheduleFormFromRequestBody({ phases });

		const request = buildCreateScheduleRequestBody({
			...form,
			customerId: "cus_1",
			features: [],
			nowMs: now,
			phases: form?.phases ?? [],
			products: ["launch", "scale", "enterprise"].map(
				(id) => ({ id, items: [] }) as unknown as ProductV2,
			),
		});
		expect(request?.phases.map((phase) => phase.billing_cycle_anchor)).toEqual([
			undefined,
			undefined,
			"phase_start",
		]);
		expect(request).not.toHaveProperty("billing_cycle_anchor");
	});

	test("round trips a custom billing cycle anchor and ends_at", () => {
		const now = Date.UTC(2027, 0, 1);
		const form = scheduleFormFromRequestBody({
			billing_cycle_anchor: Date.UTC(2027, 0, 15),
			ends_at: Date.UTC(2027, 6, 1),
			phases: [{ plans: [{ plan_id: "launch" }], starts_at: now }],
		});
		expect(form).toMatchObject({
			billingCycleAnchorDate: Date.UTC(2027, 0, 15),
			billingCycleAnchorMode: "custom",
			endDate: Date.UTC(2027, 6, 1),
			resetBillingCycle: true,
		});

		const request = buildCreateScheduleRequestBody({
			...form,
			customerId: "cus_1",
			features: [],
			nowMs: now,
			phases: form?.phases ?? [],
			products: [{ id: "launch", items: [] } as unknown as ProductV2],
		});
		expect(request).toMatchObject({
			billing_cycle_anchor: Date.UTC(2027, 0, 15),
			ends_at: Date.UTC(2027, 6, 1),
		});
	});

	test("maps a now anchor without an end date", () => {
		const form = scheduleFormFromRequestBody({
			billing_cycle_anchor: "now",
			phases: [{ plans: [{ plan_id: "launch" }], starts_at: "now" }],
		});

		expect(form).toMatchObject({
			billingCycleAnchorMode: "now",
			endDate: null,
			resetBillingCycle: true,
		});
		expect(form).not.toHaveProperty("billingCycleAnchorDate");
	});
});
