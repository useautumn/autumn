import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingChangeResponse } from "@/internal/billing/v2/utils/billingChangeResponse";
import {
	expectBillingChangeResponse,
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
const PERIOD_END = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — multiAttach", () => {
	test("multiple inserts, no current products", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW });
		const seatsAddon = makeFullCusProduct({
			planId: "seats_addon",
			startedAt: NOW,
		});
		const storageAddon = makeFullCusProduct({
			planId: "storage_addon",
			startedAt: NOW,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer(),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [pro, seatsAddon, storageAddon],
			}),
		});
		logChangeResponse("multiAttach / multiple inserts no current", response);

		expectBillingChangeResponse(response, {
			activated: ["pro", "seats_addon", "storage_addon"],
		});
	});

	test("multi-insert with one transitioning current product", () => {
		const free = makeFullCusProduct({ planId: "free", startedAt: NOW - 1000 });
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW });
		const addon = makeFullCusProduct({
			planId: "seats_addon",
			startedAt: NOW,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [free] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [pro, addon],
				update: makeUpdate({
					customerProduct: free,
					updates: {
						status: CusProductStatus.Expired,
						ended_at: NOW,
						canceled: true,
						canceled_at: NOW,
					},
				}),
			}),
		});
		logChangeResponse(
			"multiAttach / multi-insert with one transition",
			response,
		);

		expectBillingChangeResponse(response, {
			expired: ["free"],
			activated: ["pro", "seats_addon"],
		});
	});

	test("mixed statuses across inserts (active + scheduled)", () => {
		const pro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW,
		});
		const scheduledAddon = makeFullCusProduct({
			planId: "seats_addon",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer(),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [pro, scheduledAddon],
			}),
		});
		logChangeResponse("multiAttach / mixed statuses", response);

		expectBillingChangeResponse(response, {
			activated: ["pro"],
			scheduled: ["seats_addon"],
		});
		expect(
			findPlanChange(response, { action: "activated", planId: "pro" })
				?.subscription?.status,
		).toBe("active");
		expect(
			findPlanChange(response, {
				action: "scheduled",
				planId: "seats_addon",
			})?.subscription?.status,
		).toBe("scheduled");
	});
});
