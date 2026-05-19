import { describe, expect, test } from "bun:test";
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
const PERIOD_END = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — restore", () => {
	test("restore single canceled product", () => {
		const canceledPro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 1000,
			canceledAt: NOW - 500,
			endedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [canceledPro],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({
				update: makeUpdate({
					customerProduct: canceledPro,
					updates: {
						canceled: false,
						canceled_at: null,
						ended_at: null,
					},
				}),
			}),
		});
		logChangeResponse("restore / single canceled product", response);

		expectBillingChangeResponse(response, { updated: ["pro"] });
		const updated = findPlanChange(response, {
			action: "updated",
			planId: "pro",
		});
		expectPlanChange(updated, {
			action: "updated",
			planId: "pro",
			previousAttributes: {
				canceled_at: NOW - 500,
				expires_at: PERIOD_END,
			},
		});
		expect(updated?.plan.canceled_at).toBeNull();
		expect(updated?.plan.expires_at).toBeNull();
	});

	test("restore multiple via updateCustomerProducts array", () => {
		const proBase = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 1000,
			canceledAt: NOW - 500,
			endedAt: PERIOD_END,
		});
		const addon = makeFullCusProduct({
			planId: "seats_addon",
			startedAt: NOW - 1000,
			canceledAt: NOW - 500,
			endedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [proBase, addon],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({
				updates: [
					makeUpdate({
						customerProduct: proBase,
						updates: { canceled: false, canceled_at: null, ended_at: null },
					}),
					makeUpdate({
						customerProduct: addon,
						updates: { canceled: false, canceled_at: null, ended_at: null },
					}),
				],
			}),
		});
		logChangeResponse("restore / multiple via array", response);

		expectBillingChangeResponse(response, {
			updated: ["pro", "seats_addon"],
		});
		for (const planId of ["pro", "seats_addon"]) {
			const change = findPlanChange(response, {
				action: "updated",
				planId,
			});
			expectPlanChange(change, {
				action: "updated",
				planId,
				previousAttributes: {
					canceled_at: NOW - 500,
					expires_at: PERIOD_END,
				},
			});
		}
	});
});
