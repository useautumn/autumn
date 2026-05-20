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
	makeCustomerEntitlement,
	makePatch,
	makeUpdate,
} from "./helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "./helpers/makeFullCusProduct";
import { makeFullCustomer } from "./helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — migrate", () => {
	test("migrate via update plan path (replace product)", () => {
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
					updates: { status: CusProductStatus.Expired },
				}),
			}),
		});
		logChangeResponse("migrate / update plan path", response);

		expectBillingChangeResponse(response, {
			expired: ["pro"],
			activated: ["pro_v2"],
		});
		expectPlanChange(findPlanChange(response, { action: "expired", planId: "pro" }), {
			action: "expired",
			planId: "pro",
			previousAttributes: { status: CusProductStatus.Active },
		});
	});

	test("migrate via patch items (carry rollover)", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				patches: [
					makePatch({
						customerProduct: pro,
						insertEntitlements: [
							makeCustomerEntitlement({ featureId: "new_feature_x" }),
							makeCustomerEntitlement({ featureId: "new_feature_y" }),
						],
						deleteEntitlements: [
							makeCustomerEntitlement({ featureId: "old_feature" }),
						],
					}),
				],
			}),
		});
		logChangeResponse("migrate / patch items (carry rollover)", response);

		expectBillingChangeResponse(response, { updated: ["pro"] });
		expectPlanChange(findPlanChange(response, { action: "updated", planId: "pro" }), {
			action: "updated",
			planId: "pro",
			itemChanges: [
				{ action: "created", feature_id: "new_feature_x" },
				{ action: "created", feature_id: "new_feature_y" },
				{ action: "deleted", feature_id: "old_feature" },
			],
		});
	});
});
