/**
 * Stress fixture + bounds contract for loose entitlement hydration budgets:
 *   - Active loose ents share a single LIMIT 30 (EXTRA_CUSTOMER_ENTITLEMENT_LIMIT).
 *   - Expired loose ents ride a SEPARATE LIMIT 20 bucket (dashboard flag only),
 *     so they can never crowd active ones out.
 *
 * Seeds customer "max-limits-horror" with 35 live + 25 expired loose Messages
 * balances and leaves it behind for manual dashboard QA of the bounded view.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	ApiVersion,
	CusProductStatus,
	isCusEntExpired,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	EXPIRED_EXTRA_CUSTOMER_ENTITLEMENT_LIMIT,
	EXTRA_CUSTOMER_ENTITLEMENT_LIMIT,
} from "@/internal/customers/getFullCusQuery.js";

function sleepUntil(epochMs: number): Promise<void> {
	const delay = epochMs - Date.now();
	if (delay <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, delay));
}

const testCase = "max-limits-horror";
const LIVE_COUNT = EXTRA_CUSTOMER_ENTITLEMENT_LIMIT + 5;
const EXPIRED_COUNT = EXPIRED_EXTRA_CUSTOMER_ENTITLEMENT_LIMIT + 5;
// Default cusProductLimit is 15; 16 sequential attaches of the same main
// product leave 15 expired + 1 active, pressing the plan hydration bound too.
const ATTACH_COUNT = 16;
const CUS_PRODUCT_LIMIT = 15;

test.concurrent(
	chalk.yellowBright(
		`${testCase}: loose hydration caps at 30 active + 20 expired`,
	),
	async () => {
		const customerId = testCase;
		const planA = products.base({
			id: "horror-a",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const planB = products.base({
			id: "horror-b",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [],
		});

		// Alternating attaches of two main plans: each attach expires the other,
		// leaving ATTACH_COUNT - 1 expired + 1 active.
		for (let i = 0; i < ATTACH_COUNT; i++) {
			await autumnV2_3.attach({
				customer_id: customerId,
				product_id: i % 2 === 0 ? planA.id : planB.id,
			});
		}

		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		const expiresAt = Date.now() + 8000;
		for (let i = 0; i < EXPIRED_COUNT; i++) {
			await autumnV1.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				granted_balance: 1000 + i,
				expires_at: expiresAt,
			});
		}
		for (let i = 0; i < LIVE_COUNT; i++) {
			await autumnV1.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				granted_balance: i + 1,
			});
		}
		await sleepUntil(expiresAt + 1000);

		// Flag off: exactly the active budget, no expired rows.
		const publicFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const publicLoose = publicFullCustomer.extra_customer_entitlements ?? [];
		expect(publicLoose).toHaveLength(EXTRA_CUSTOMER_ENTITLEMENT_LIMIT);
		expect(publicLoose.every((cusEnt) => !isCusEntExpired({ cusEnt }))).toBe(
			true,
		);

		// Flag on: active budget untouched PLUS the separate expired budget.
		const internalFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			includeExpiredLooseEntitlements: true,
		});
		const internalLoose =
			internalFullCustomer.extra_customer_entitlements ?? [];
		const activeCount = internalLoose.filter(
			(cusEnt) => !isCusEntExpired({ cusEnt }),
		).length;
		const expiredCount = internalLoose.filter((cusEnt) =>
			isCusEntExpired({ cusEnt }),
		).length;

		expect(activeCount).toBe(EXTRA_CUSTOMER_ENTITLEMENT_LIMIT);
		expect(expiredCount).toBe(EXPIRED_EXTRA_CUSTOMER_ENTITLEMENT_LIMIT);

		// Plan side: hydration bounded by cusProductLimit, active plan always
		// survives (relevant statuses sort ahead of expired before the LIMIT).
		const dashboardFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			inStatuses: ALL_STATUSES,
			includeExpiredLooseEntitlements: true,
		});
		const customerProducts = dashboardFullCustomer.customer_products;
		expect(customerProducts.length).toBeLessThanOrEqual(CUS_PRODUCT_LIMIT);
		expect(
			customerProducts.filter(
				(customerProduct) => customerProduct.status === CusProductStatus.Active,
			),
		).toHaveLength(1);
		expect(
			customerProducts.some(
				(customerProduct) =>
					customerProduct.status === CusProductStatus.Expired,
			),
		).toBe(true);
	},
	{ timeout: 180_000 },
);
