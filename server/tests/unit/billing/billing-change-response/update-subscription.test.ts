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
	makeCustomerEntitlement,
	makePatch,
	makeUpdate,
} from "./helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "./helpers/makeFullCusProduct";
import { makeFullCustomer } from "./helpers/makeFullCustomer";

const NOW = 1_710_000_000_000;
const PERIOD_END = NOW + 30 * 24 * 60 * 60 * 1000;
const ctx = {} as AutumnContext;

describe("buildBillingChangeResponse — updateSubscription", () => {
	test("cancel at end of cycle", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const defaultFree = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [defaultFree],
				update: makeUpdate({
					customerProduct: pro,
					updates: {
						canceled: true,
						canceled_at: NOW,
						ended_at: PERIOD_END,
					},
				}),
			}),
		});
		logChangeResponse("update / cancel end of cycle", response);

		expectBillingChangeResponse(response, {
			updated: ["pro"],
			scheduled: ["free"],
		});
		expectPlanChange(findPlanChange(response, { action: "updated", planId: "pro" }), {
			action: "updated",
			planId: "pro",
			previousAttributes: { canceled_at: null, expires_at: null },
		});
		const scheduled = findPlanChange(response, {
			action: "scheduled",
			planId: "free",
		});
		expect(scheduled?.subscription?.status).toBe("scheduled");
	});

	test("cancel immediately", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });
		const defaultFree = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Active,
			startedAt: NOW,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [defaultFree],
				update: makeUpdate({
					customerProduct: pro,
					updates: {
						canceled: true,
						canceled_at: NOW,
						ended_at: NOW,
						status: CusProductStatus.Expired,
					},
				}),
			}),
		});
		logChangeResponse("update / cancel immediately", response);

		expectBillingChangeResponse(response, {
			expired: ["pro"],
			activated: ["free"],
		});
		expectPlanChange(findPlanChange(response, { action: "expired", planId: "pro" }), {
			action: "expired",
			planId: "pro",
			previousAttributes: {
				status: CusProductStatus.Active,
				canceled_at: null,
				expires_at: null,
			},
		});
	});

	test("uncancel", () => {
		const pro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 1000,
			canceledAt: NOW - 500,
			endedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				update: makeUpdate({
					customerProduct: pro,
					updates: {
						canceled: false,
						canceled_at: null,
						ended_at: null,
					},
				}),
			}),
		});
		logChangeResponse("update / uncancel", response);

		expectBillingChangeResponse(response, { updated: ["pro"] });
		expectPlanChange(findPlanChange(response, { action: "updated", planId: "pro" }), {
			action: "updated",
			planId: "pro",
			previousAttributes: {
				canceled_at: NOW - 500,
				expires_at: PERIOD_END,
			},
		});
		const updated = findPlanChange(response, {
			action: "updated",
			planId: "pro",
		});
		expect(updated?.subscription?.canceled_at).toBeNull();
		expect(updated?.subscription?.expires_at).toBeNull();
	});

	test("update plan via custom plan (replace product)", () => {
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
		logChangeResponse("update / custom plan replacement", response);

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

	test("delete a scheduled product emits nothing (deletes ignored for now)", () => {
		const scheduledFree = makeFullCusProduct({
			planId: "free",
			status: CusProductStatus.Scheduled,
			startedAt: PERIOD_END,
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [scheduledFree],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({ deleteOne: scheduledFree }),
		});
		logChangeResponse("update / delete scheduled product (ignored)", response);

		expectBillingChangeResponse(response, {});
		expect(response.plan_changes).toEqual([]);
	});

	test("patch items (inline mode) — add and remove features", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				patches: [
					makePatch({
						customerProduct: pro,
						insertEntitlements: [
							makeCustomerEntitlement({ featureId: "api_calls" }),
						],
						deleteEntitlements: [
							makeCustomerEntitlement({ featureId: "legacy_feature" }),
						],
					}),
				],
			}),
		});
		logChangeResponse("update / patch items", response);

		expectBillingChangeResponse(response, { updated: ["pro"] });
		expectPlanChange(findPlanChange(response, { action: "updated", planId: "pro" }), {
			action: "updated",
			planId: "pro",
			itemChanges: [
				{ action: "created", feature_id: "api_calls" },
				{ action: "deleted", feature_id: "legacy_feature" },
			],
		});
	});

	test("quantity-only update — empty previous_attributes (v1 limitation)", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				update: makeUpdate({
					customerProduct: pro,
					updates: {
						options: [{ feature_id: "seats", quantity: 10 }],
					},
				}),
			}),
		});
		logChangeResponse("update / quantity only", response);

		expectBillingChangeResponse(response, { updated: ["pro"] });
		const updated = findPlanChange(response, {
			action: "updated",
			planId: "pro",
		});
		expect(updated?.previous_attributes).toEqual({});
		expect(updated?.item_changes).toEqual([]);
	});

	test("anchor reset — empty updates object", () => {
		const pro = makeFullCusProduct({ planId: "pro", startedAt: NOW - 1000 });

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({ customerProducts: [pro] }),
			autumnBillingPlan: makeAutumnBillingPlan({
				update: makeUpdate({ customerProduct: pro, updates: {} }),
			}),
		});
		logChangeResponse("update / empty updates (anchor reset)", response);

		expectBillingChangeResponse(response, { updated: ["pro"] });
		const updated = findPlanChange(response, {
			action: "updated",
			planId: "pro",
		});
		expect(updated?.previous_attributes).toEqual({});
	});

	// Regression for the collapseSamePlanIdPairs double-match bug: an inserted
	// `activated` paired with an expired update of the same plan_id must merge
	// to exactly one `updated`; a SECOND expired update for the same plan_id
	// must remain a standalone `expired` — not re-pair with the already-merged
	// activated entry.
	test("collapse same-plan_id pairs — only one activated+expired merges, extras stay as-is", () => {
		const newPro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW,
			id: "cp_pro_new",
		});
		const oldPro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 30_000,
			id: "cp_pro_old",
		});
		const olderPro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 60_000,
			id: "cp_pro_older",
		});

		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer: makeFullCustomer({
				customerProducts: [oldPro, olderPro],
			}),
			autumnBillingPlan: makeAutumnBillingPlan({
				inserts: [newPro],
				updates: [
					makeUpdate({
						customerProduct: oldPro,
						updates: { status: CusProductStatus.Expired },
					}),
					makeUpdate({
						customerProduct: olderPro,
						updates: { status: CusProductStatus.Expired },
					}),
				],
			}),
		});
		logChangeResponse("update / triple same-plan_id collapse", response);

		// Expect ONE `updated` (newPro + the first expired merged) and ONE
		// `expired` (the second leftover) — not two `updated`.
		expectBillingChangeResponse(response, {
			updated: ["pro"],
			expired: ["pro"],
		});
	});

	test("collapse same-plan_id pairs preserves replacement item changes", () => {
		const newPro = makeFullCusProduct({
			planId: "pro",
			status: CusProductStatus.Active,
			startedAt: NOW,
			id: "cp_pro_new",
		});
		newPro.customer_entitlements = [
			makeCustomerEntitlement({ featureId: "api_calls" }),
		];

		const oldPro = makeFullCusProduct({
			planId: "pro",
			startedAt: NOW - 30_000,
			id: "cp_pro_old",
		});
		oldPro.customer_entitlements = [
			makeCustomerEntitlement({ featureId: "legacy_feature" }),
		];

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

		expectBillingChangeResponse(response, { updated: ["pro"] });
		expectPlanChange(findPlanChange(response, { action: "updated", planId: "pro" }), {
			action: "updated",
			planId: "pro",
			itemChanges: [
				{ action: "created", feature_id: "api_calls" },
				{ action: "deleted", feature_id: "legacy_feature" },
			],
		});
	});
});
