import { describe, expect, test } from "bun:test";
import { CusProductStatus, ms } from "@autumn/shared";
import { customers } from "@tests/utils/fixtures/db/customers";
import { buildSavedPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/balances/buildSavedPhaseCustomers";
import { makeAutumnBillingPlan } from "../../billing-change-response/helpers/makeAutumnBillingPlan";
import {
	balanceCtx,
	included,
	NOW,
	PHASE_TWO,
	planRow,
	scheduledRow,
} from "./balanceFixtures";

describe("buildSavedPhaseCustomers", () => {
	test("a saved date before the request's first phase start still starts the saved rows due by it", () => {
		const pro = planRow({
			planId: "pro",
			endedAt: PHASE_TWO,
			balances: [included({ featureId: "words", allowance: 100 })],
		});
		const premium = scheduledRow({
			planId: "premium",
			startsAt: PHASE_TWO,
			balances: [included({ featureId: "words", allowance: 200 })],
		});
		const fullCustomer = customers.create({ customerProducts: [pro, premium] });

		const savedCustomers = buildSavedPhaseCustomers({
			ctx: balanceCtx,
			fullCustomer,
			autumnBillingPlan: makeAutumnBillingPlan({}),
			phases: [
				{ startsAt: PHASE_TWO + ms.days(5), customerProductIds: [premium.id] },
			],
			dates: [PHASE_TWO],
			now: NOW,
		});

		expect(
			savedCustomers
				.get(PHASE_TWO)
				?.customer_products.map(({ id, status }) => [id, status]),
		).toEqual([
			[pro.id, CusProductStatus.Expired],
			[premium.id, CusProductStatus.Active],
		]);
	});
});
