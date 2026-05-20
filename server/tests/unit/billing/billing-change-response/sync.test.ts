import { describe, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingChangeResponse } from "@/internal/billing/v2/utils/billingChangeResponse";
import {
	expectBillingChangeResponse,
	expectPlanChange,
	findPlanChange,
} from "./helpers/expectBillingChange";
import { logChangeResponse } from "./helpers/logChangeResponse";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "./helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "./helpers/makeFullCusProduct";
import { makeFullCustomer } from "./helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — sync (from Stripe)", () => {
	test("sync with expire_previous=true", () => {
		const oldPro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 1000,
		});
		const newPro = makeFullCusProduct({ planId: "pro_v2", startedAt: NOW });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [oldPro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [newPro],
				update: makeUpdate({
					customerProduct: oldPro,
					updates: {
						status: CusProductStatus.Expired,
						ended_at: NOW,
						canceled: true,
						canceled_at: NOW,
					},
				}),
			}),
		});
		logChangeResponse("sync / expire_previous=true", response);

		expectBillingChangeResponse(response, {
			expired: ["pro"],
			activated: ["pro_v2"],
		});
		expectPlanChange(
			findPlanChange(response, { action: "expired", planId: "pro" }),
			{
				action: "expired",
				planId: "pro",
				previousAttributes: { status: CusProductStatus.Active },
			},
		);
	});

	test("sync with expire_previous=false (both products active)", () => {
		const baseAddon = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 1000,
		});
		const newAddon = makeFullCusProduct({
			planId: "seats_addon",
			startedAt: NOW,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [baseAddon],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({ inserts: [newAddon] }),
		});
		logChangeResponse("sync / expire_previous=false", response);

		expectBillingChangeResponse(response, { activated: ["seats_addon"] });
	});
});
