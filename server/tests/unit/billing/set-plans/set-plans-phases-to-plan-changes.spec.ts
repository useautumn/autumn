import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { setPlansPhasesToPlanChanges } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhasesToPlanChanges";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

describe("setPlansPhasesToPlanChanges", () => {
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

		const planChanges = setPlansPhasesToPlanChanges({
			autumnBillingPlan: planWithEndDate,
			originalFullCustomer,
			phases,
			phaseCustomers: buildSetPlansPhaseCustomers({
				ctx,
				fullCustomer: originalFullCustomer,
				autumnBillingPlan: planWithEndDate,
				phases,
			}),
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
			[
				["scheduled", "premium"],
				["expired", "pro"],
			],
		]);
	});

	test("a kept plan ending at a later phase only appears as that phase's expiry", () => {
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

		const planChanges = setPlansPhasesToPlanChanges({
			autumnBillingPlan,
			originalFullCustomer,
			phases,
			phaseCustomers: buildSetPlansPhaseCustomers({
				ctx,
				fullCustomer: originalFullCustomer,
				autumnBillingPlan,
				phases,
			}),
		});

		expect(
			planChanges.map((changes) =>
				changes.map((change) => [change.action, change.subscription?.plan_id]),
			),
		).toEqual([
			[],
			[
				["scheduled", "premium"],
				["expired", "pro"],
			],
		]);
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

		const planChanges = setPlansPhasesToPlanChanges({
			autumnBillingPlan,
			originalFullCustomer,
			phases,
			phaseCustomers: buildSetPlansPhaseCustomers({
				ctx,
				fullCustomer: originalFullCustomer,
				autumnBillingPlan,
				phases,
			}),
		});

		expect(planChanges[0].map((change) => change.action)).toEqual(["updated"]);
	});
});
