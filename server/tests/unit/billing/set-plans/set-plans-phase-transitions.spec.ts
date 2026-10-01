import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCustomer,
	type LineItem,
	ms,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { transitionsToCustomerPlanChanges } from "@/internal/billing/v2/actions/buildBillingChanges/autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToCustomerPlanChanges";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { setPlansPhasePlans } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhasePlans";
import { setPlansPhaseTransitions } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhaseTransitions";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import {
	makeAutumnBillingPlan,
	makePatch,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + ms.days(30);
const ctx = {} as AutumnContext;

const previewPhases = ({
	autumnBillingPlan,
	originalFullCustomer,
	phases,
	creditLineItems = [],
	keptCustomerProductIds = [],
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	creditLineItems?: LineItem[];
	keptCustomerProductIds?: string[];
}) => {
	const phaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer: originalFullCustomer,
		autumnBillingPlan,
		phases,
	});
	const phaseTransitions = setPlansPhaseTransitions({
		autumnBillingPlan,
		originalFullCustomer,
		phases,
		phaseCustomers,
		keptCustomerProductIds: new Set(keptCustomerProductIds),
	});
	return {
		planChanges: phaseTransitions.map((transitions) =>
			transitionsToCustomerPlanChanges({
				transitions,
				entities: originalFullCustomer.entities,
			}),
		),
		plans: setPlansPhasePlans({
			phases,
			phaseCustomers,
			originalFullCustomer,
			features: [],
			creditLineItems,
			currency: "usd",
		}),
	};
};

describe("setPlansPhaseTransitions", () => {
	test("a kept plan moved onto a new subscription is kept, not updated", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const originalFullCustomer = makeFullCustomer({ customerProducts: [pro] });
		const autumnBillingPlan = makeAutumnBillingPlan({
			updates: [
				makeUpdate({ customerProduct: pro, updates: { subscription_ids: [] } }),
			],
			patches: [makePatch({ customerProduct: pro })],
		});

		const { planChanges, plans } = previewPhases({
			autumnBillingPlan,
			originalFullCustomer,
			phases: [{ startsAt: NOW, customerProductIds: [pro.id] }],
			keptCustomerProductIds: [pro.id],
		});

		expect(planChanges).toEqual([[]]);
		expect(
			plans.map((phasePlans) =>
				phasePlans.map((plan) => [plan.status, plan.plan_id, plan.credit]),
			),
		).toEqual([[["kept", "pro", null]]]);
	});

	test("groups plan changes by the phase they take effect in", () => {
		const free = makeFullCusProduct({ planId: "free", startedAt: NOW - 1000 });
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW });
		const premium = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});
		const originalFullCustomer = makeFullCustomer({ customerProducts: [free] });
		const autumnBillingPlan = makeAutumnBillingPlan({
			inserts: [pro, premium],
			updates: [
				makeUpdate({
					customerProduct: free,
					updates: { status: CusProductStatus.Expired, ended_at: NOW },
				}),
			],
		});
		const phases = [
			{ startsAt: NOW, customerProductIds: [pro.id] },
			{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
		];
		const proEndingAtPhaseTwo = { ...pro, ended_at: PHASE_TWO };
		const planWithEndDate = {
			...autumnBillingPlan,
			insertCustomerProducts: [proEndingAtPhaseTwo, premium],
		};

		const { planChanges, plans } = previewPhases({
			autumnBillingPlan: planWithEndDate,
			originalFullCustomer,
			phases,
		});

		const summary = planChanges.map((changes) =>
			changes.map((change) => [
				change.action,
				change.subscription?.plan_id ?? change.purchase?.plan_id,
			]),
		);
		expect(summary).toEqual([
			[
				["activated", "pro"],
				["expired", "free"],
			],
			[["scheduled", "premium"]],
		]);
		expect(
			plans.map((phasePlans) =>
				phasePlans.map((plan) => [plan.status, plan.plan_id]),
			),
		).toEqual([
			[
				["starts", "pro"],
				["ends", "free"],
			],
			[
				["starts", "premium"],
				["ends", "free"],
			],
		]);
	});

	test("a kept plan ending at an existing later phase only appears as that phase's expiry", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const premium = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});
		const originalFullCustomer = makeFullCustomer({
			customerProducts: [pro, premium],
		});
		const autumnBillingPlan = makeAutumnBillingPlan({
			updates: [
				makeUpdate({
					customerProduct: pro,
					updates: { ended_at: PHASE_TWO },
				}),
			],
		});
		const phases = [
			{ startsAt: NOW, customerProductIds: [] },
			{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
		];

		const { planChanges, plans } = previewPhases({
			autumnBillingPlan,
			originalFullCustomer,
			phases,
			keptCustomerProductIds: [premium.id],
		});

		expect(
			plans.map((phasePlans) =>
				phasePlans.map((plan) => [plan.status, plan.plan_id]),
			),
		).toEqual([
			[["kept", "pro"]],
			[
				["ends", "pro"],
				["kept", "premium"],
			],
		]);
		expect(
			planChanges.map((changes) =>
				changes.map((change) => [change.action, change.subscription?.plan_id]),
			),
		).toEqual([[], [["expired", "pro"]]]);
	});

	test("an immediate lifecycle change on a kept plan stays in the first phase", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const originalFullCustomer = makeFullCustomer({ customerProducts: [pro] });
		const autumnBillingPlan = makeAutumnBillingPlan({
			updates: [
				makeUpdate({
					customerProduct: pro,
					updates: { canceled_at: NOW, ended_at: PHASE_TWO },
				}),
			],
		});
		const phases = [
			{ startsAt: NOW, customerProductIds: [] },
			{ startsAt: PHASE_TWO, customerProductIds: [] },
		];

		const { planChanges } = previewPhases({
			autumnBillingPlan,
			originalFullCustomer,
			phases,
		});

		expect(planChanges[0].map((change) => change.action)).toEqual(["updated"]);
	});

	test("a plan ending now carries only its own credit, and custom plans say so", () => {
		const proOnEntityA = makeFullCusProduct({
			planId: "pro",
			id: "cp_pro_a",
			startedAt: NOW - 1000,
		});
		const proOnEntityB = {
			...makeFullCusProduct({
				planId: "pro",
				id: "cp_pro_b",
				startedAt: NOW - 1000,
			}),
			is_custom: true,
		};
		const originalFullCustomer = makeFullCustomer({
			customerProducts: [proOnEntityA, proOnEntityB],
		});
		const autumnBillingPlan = makeAutumnBillingPlan({
			updates: [
				makeUpdate({
					customerProduct: proOnEntityA,
					updates: { status: CusProductStatus.Expired, ended_at: NOW },
				}),
			],
		});
		const refundFor = ({ id, amount }: { id: string; amount: number }) =>
			({
				amountAfterDiscounts: amount,
				chargeImmediately: true,
				context: { customerProduct: { id } },
			}) as unknown as LineItem;

		const { plans } = previewPhases({
			autumnBillingPlan,
			originalFullCustomer,
			phases: [{ startsAt: NOW, customerProductIds: [] }],
			creditLineItems: [
				refundFor({ id: "cp_pro_a", amount: -12.345 }),
				refundFor({ id: "cp_pro_a", amount: -2 }),
				refundFor({ id: "cp_pro_b", amount: -50 }),
			],
		});

		expect(
			plans[0].map((plan) => [plan.status, plan.credit, plan.custom]),
		).toEqual([
			["ends", -14.35, false],
			["kept", null, true],
		]);
	});

	test("a newly added phase ends the plans the saved state still holds there", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const premium = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});
		const originalFullCustomer = makeFullCustomer({ customerProducts: [pro] });
		const autumnBillingPlan = makeAutumnBillingPlan({
			inserts: [premium],
			updates: [
				makeUpdate({ customerProduct: pro, updates: { ended_at: PHASE_TWO } }),
			],
		});

		const { planChanges, plans } = previewPhases({
			autumnBillingPlan,
			originalFullCustomer,
			phases: [
				{ startsAt: NOW, customerProductIds: [] },
				{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
			],
		});

		expect(
			plans.map((phasePlans) =>
				phasePlans.map((plan) => [plan.status, plan.plan_id]),
			),
		).toEqual([
			[["kept", "pro"]],
			[
				["starts", "premium"],
				["ends", "pro"],
			],
		]);
		expect(
			planChanges[1].map((change) => [
				change.action,
				change.subscription?.plan_id,
			]),
		).toEqual([["scheduled", "premium"]]);
	});
});
