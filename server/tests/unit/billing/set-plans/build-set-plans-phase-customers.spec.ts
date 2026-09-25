import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PHASE_TWO = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

const statusesByPlan = (fullCustomer: FullCustomer) =>
	Object.fromEntries(
		fullCustomer.customer_products.map((customerProduct) => [
			customerProduct.product_id,
			customerProduct.status,
		]),
	);

describe("buildSetPlansPhaseCustomers", () => {
	test("projects the customer at the start of every phase", () => {
		const free = makeFullCusProduct({ planId: "free", startedAt: NOW - 1000 });
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW });
		const premium = makeFullCusProduct({
			planId: "premium",
			status: CusProductStatus.Scheduled,
			startedAt: PHASE_TWO,
		});

		const phaseCustomers = buildSetPlansPhaseCustomers({
			ctx,
			fullCustomer: makeFullCustomer({ customerProducts: [free] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [pro, premium],
				updates: [
					makeUpdate({
						customerProduct: free,
						updates: { status: CusProductStatus.Expired, ended_at: NOW },
					}),
					makeUpdate({
						customerProduct: pro,
						updates: { ended_at: PHASE_TWO },
					}),
				],
			}),
			phases: [
				{ startsAt: NOW, customerProductIds: [pro.id] },
				{ startsAt: PHASE_TWO, customerProductIds: [premium.id] },
			],
		});

		expect(phaseCustomers.map(statusesByPlan)).toEqual([
			{
				free: CusProductStatus.Expired,
				pro: CusProductStatus.Active,
				premium: CusProductStatus.Scheduled,
			},
			{
				free: CusProductStatus.Expired,
				pro: CusProductStatus.Expired,
				premium: CusProductStatus.Active,
			},
		]);
	});

	test("a plan whose trial outlasts its phase start starts trialing", () => {
		const trialingPremium = {
			...makeFullCusProduct({
				planId: "premium",
				status: CusProductStatus.Scheduled,
				startedAt: PHASE_TWO,
			}),
			trial_ends_at: PHASE_TWO + 14 * 24 * 60 * 60 * 1000,
		};

		const phaseCustomers = buildSetPlansPhaseCustomers({
			ctx,
			fullCustomer: makeFullCustomer(),
			autumnBillingPlan: makeAutumnBillingPlan({ inserts: [trialingPremium] }),
			phases: [
				{ startsAt: NOW, customerProductIds: [] },
				{ startsAt: PHASE_TWO, customerProductIds: [trialingPremium.id] },
			],
		});

		expect(statusesByPlan(phaseCustomers[1])).toEqual({
			premium: CusProductStatus.Trialing,
		});
	});
});
