import { expect, test } from "bun:test";
import { ApiVersion, fullCustomerToCustomerEntitlements } from "@autumn/shared";
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

const testCase = "loose-expired-internal-visibility";

test.concurrent(
	chalk.yellowBright(
		`${testCase}: includeExpiredLooseEntitlements hydrates expired loose ents for internal reads only`,
	),
	async () => {
		const customerId = testCase;
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [],
		});

		const autumnV1 = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.orgSecretKey,
		});

		const expiresAt = Date.now() + 3000;

		// One loose balance that expires shortly, one that never expires.
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

		// Default (public) hydration: the expired loose entitlement is dropped in SQL.
		const publicFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const publicLooseEnts =
			publicFullCustomer.extra_customer_entitlements ?? [];
		expect(publicLooseEnts).toHaveLength(1);
		expect(publicLooseEnts[0]?.expires_at).toBeNull();
		expect(publicLooseEnts[0]?.balance).toBe(100);

		// Internal dashboard hydration: the expired loose entitlement is included.
		const internalFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			includeExpiredLooseEntitlements: true,
		});

		const internalLooseEnts =
			internalFullCustomer.extra_customer_entitlements ?? [];
		expect(internalLooseEnts).toHaveLength(2);

		const expiredLooseEnt = internalLooseEnts.find(
			(customerEntitlement) => customerEntitlement.expires_at != null,
		);
		expect(expiredLooseEnt).toBeDefined();
		expect(expiredLooseEnt?.expires_at).toBe(expiresAt);
		expect(expiredLooseEnt?.balance).toBe(200);

		// Even with the expired row hydrated, the TS selection layer still filters
		// it out — public read paths stay byte-identical.
		const selectedCustomerEntitlements = fullCustomerToCustomerEntitlements({
			fullCustomer: internalFullCustomer,
			featureIds: [TestFeature.Messages],
		});

		expect(
			selectedCustomerEntitlements.every(
				(customerEntitlement) => customerEntitlement.expires_at == null,
			),
		).toBe(true);
		expect(
			selectedCustomerEntitlements.some(
				(customerEntitlement) => customerEntitlement.balance === 100,
			),
		).toBe(true);
	},
);
