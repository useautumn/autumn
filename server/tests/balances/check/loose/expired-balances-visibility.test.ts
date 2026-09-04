/**
 * Canonical fixture + contract for expired-balance visibility (dashboard-only):
 *   - Expired PLAN balances: an expired (canceled) product's cusEnts still
 *     hydrate under ALL_STATUSES and are classified display-expired via the
 *     product status (their own expires_at is null).
 *   - Expired LOOSE balances: hydrate only with includeExpiredLooseEntitlements
 *     and are classified display-expired via their own expires_at.
 *   - Public selection (fullCustomerToCustomerEntitlements + default statuses)
 *     never sees either.
 *
 * Leaves customer "expired-balances-visibility" behind for manual dashboard QA:
 * one live plan (Messages 80), one expired plan (Messages 50), one live loose
 * (Messages 100), one expired loose (Messages 200).
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	ApiVersion,
	CusProductStatus,
	fullCustomerToCustomerEntitlements,
	isCusEntDisplayExpired,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";

function sleepUntil(epochMs: number): Promise<void> {
	const delay = epochMs - Date.now();
	if (delay <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, delay));
}

const testCase = "expired-balances-visibility";

test.concurrent(
	chalk.yellowBright(
		`${testCase}: expired plan + loose balances hydrate internally and classify display-expired`,
	),
	async () => {
		const customerId = testCase;
		const churnedProd = products.base({
			id: "churned",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const liveProd = products.base({
			id: "live",
			items: [items.monthlyMessages({ includedUsage: 80 })],
		});

		// Attaching liveProd second replaces churnedProd (same main group), so
		// churnedProd's cusEnts become expired-plan balances.
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [churnedProd, liveProd] }),
			],
			actions: [
				s.attach({ productId: churnedProd.id }),
				s.attach({ productId: liveProd.id }),
			],
		});

		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		const expiresAt = Date.now() + 3000;
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 200,
			expires_at: expiresAt,
		});
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
		});
		await sleepUntil(expiresAt + 1000);

		// Internal hydration (dashboard): everything present.
		const internalFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			inStatuses: ALL_STATUSES,
			includeExpiredLooseEntitlements: true,
		});

		const expiredProduct = internalFullCustomer.customer_products.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Expired,
		);
		expect(expiredProduct).toBeDefined();
		expect(expiredProduct?.customer_entitlements).toHaveLength(1);
		const expiredPlanEnt = expiredProduct?.customer_entitlements[0];
		expect(expiredPlanEnt?.balance).toBe(50);
		// Plan cusEnts carry no expires_at — display-expiry comes from the product.
		expect(
			isCusEntDisplayExpired({
				cusEnt: { ...expiredPlanEnt!, customer_product: expiredProduct! },
			}),
		).toBe(true);

		const looseEnts = internalFullCustomer.extra_customer_entitlements ?? [];
		expect(looseEnts).toHaveLength(2);
		const expiredLoose = looseEnts.find(
			(customerEntitlement) => customerEntitlement.expires_at != null,
		);
		expect(expiredLoose?.balance).toBe(200);
		expect(
			isCusEntDisplayExpired({
				cusEnt: { ...expiredLoose!, customer_product: null },
			}),
		).toBe(true);

		const liveLoose = looseEnts.find(
			(customerEntitlement) => customerEntitlement.expires_at == null,
		);
		expect(
			isCusEntDisplayExpired({
				cusEnt: { ...liveLoose!, customer_product: null },
			}),
		).toBe(false);

		// Public-shaped read: default statuses + no flag — expired plan and
		// expired loose are both invisible.
		const publicFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(
			publicFullCustomer.customer_products.some(
				(customerProduct) =>
					customerProduct.status === CusProductStatus.Expired,
			),
		).toBe(false);
		expect(publicFullCustomer.extra_customer_entitlements ?? []).toHaveLength(
			1,
		);

		// Selection layer over the internal hydration still excludes both.
		const selected = fullCustomerToCustomerEntitlements({
			fullCustomer: internalFullCustomer,
			featureIds: [TestFeature.Messages],
		});
		expect(
			selected.every(
				(customerEntitlement) =>
					customerEntitlement.expires_at == null &&
					customerEntitlement.customer_product?.status !==
						CusProductStatus.Expired,
			),
		).toBe(true);
	},
);
