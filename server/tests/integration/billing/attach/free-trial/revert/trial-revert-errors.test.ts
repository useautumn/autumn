/**
 * Trial Revert — Error & Edge Case Tests
 *
 * Verifies all invalid combinations of on_end: "revert" are rejected:
 * - card_required: true + on_end: "revert" (card collected but never used)
 * - No existing customer product (nothing to revert to)
 * - Existing free plan with no Stripe subscription (can't revert without sub)
 *
 * Also verifies edge cases:
 * - Downgrade with on_end: "revert" does NOT pause the current plan prematurely
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
} from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: card_required: true + on_end: "revert" → error
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-revert-errors 1: card_required true + revert throws")}`,
	async () => {
		const customerId = "trial-revert-err-card";

		const messagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterprisePrice],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: true,
					on_end: "revert",
				},
			},
		};

		await expect(
			autumnV2.billing.attach<AttachParamsV1Input>(params),
		).rejects.toThrow();
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: No existing plan → error
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-revert-errors 2: no existing plan throws")}`,
	async () => {
		const customerId = "trial-revert-err-no-plan";

		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterprisePrice],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [enterprise] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await expect(
			autumnV2.billing.attach<AttachParamsV1Input>(params),
		).rejects.toThrow();
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Free plan (no Stripe subscription) → error
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("trial-revert-errors 3: free plan no subscription throws")}`,
	async () => {
		const customerId = "trial-revert-err-free-sub";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({ id: "free", items: [freeMessages] });

		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterprisePrice],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free, enterprise] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await expect(
			autumnV2.billing.attach<AttachParamsV1Input>(params),
		).rejects.toThrow();
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Downgrade with on_end: "revert" does NOT pause current plan
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer is on enterprise ($50/mo)
 * - Attach cheaper pro ($20/mo) with on_end: "revert" trial
 * - This is a downgrade, so planTiming = "end_of_cycle"
 *
 * Expected:
 * - Enterprise is NOT paused (revert only applies to immediate transitions)
 */
test.concurrent(
	`${chalk.yellowBright("trial-revert-errors 4: downgrade revert does not pause current plan")}`,
	async () => {
		const customerId = "trial-revert-err-downgrade";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const proPrice = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [proMessages, proPrice],
		});

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 2000 });
		const enterprisePrice = items.monthlyPrice({ price: 50 });
		const enterprise = products.base({
			id: "enterprise",
			items: [enterpriseMessages, enterprisePrice],
		});

		const { autumnV2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: enterprise.id })],
		});

		const downgradeParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		};

		await autumnV2.billing.attach<AttachParamsV1Input>(downgradeParams);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});

		const enterpriseCp = fullCustomer.customer_products.find(
			(cp) => cp.product_id === enterprise.id,
		);

		expect(enterpriseCp).toBeDefined();
		expect(enterpriseCp!.status).not.toBe(CusProductStatus.Paused);
	},
);
