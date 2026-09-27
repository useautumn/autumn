import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import {
	expectLicensePooledCheck,
	expectLicensePooledEntitlementNotHydrated,
	expectLicensePooledGrant,
	lazyLicensePoolLifecycle,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

// Before: Free's pooled grant survives replacement alongside Pro's credits.
// After: the removed pooled grant expires and only Pro's credits remain.
test("license pooled: replacing Free with Pro removes the unassigned Free grant", async () => {
	const customerId = "lic-pool-free-to-pro";
	const free = products.base({
		id: "lic-pool-replace-free",
		items: [items.dashboard()],
	});
	const pro = products.pro({
		id: "lic-pool-replace-pro",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	const freeSeat = pooledSeatPlan({
		id: "lic-pool-replace-free-seat",
		item: pooledMonthlyMessages({ includedUsage: 100 }),
		group: "lic-pool-replace-seats",
	});
	const proSeat = products.base({
		id: "lic-pool-replace-pro-seat",
		items: [items.dashboard()],
		group: "lic-pool-replace-seats",
	});
	const { autumnV2_4, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [free, pro, freeSeat, proSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: free.id,
				licenseProductId: freeSeat.id,
				included: 1,
			}),
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: proSeat.id,
				included: 1,
			}),
			s.billing.attach({ productId: free.id }),
		],
	});
	const customerLicenseLinkId = await seatLinkId({
		db: ctx.db,
		customerId,
		licenseProductId: freeSeat.id,
	});
	await expectLicensePooledGrant({
		autumn: autumnV2_4,
		ctx,
		customerId,
		customerLicenseLinkId,
		grantPerSeat: 100,
		seatCount: 1,
		contributionCount: 0,
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});
	await expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		granted: 1000,
		remaining: 1000,
	});
	await expectLicensePooledCheck({
		autumn: autumnV2_4,
		customerId,
		allowed: true,
		remaining: 1000,
	});
	await expectLicensePooledEntitlementNotHydrated({
		ctx,
		customerId,
		customerLicenseLinkId,
	});
	await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		filter: { customerLicenseLinkId },
		pool: {
			count: 0,
			balance: 0,
			adjustment: 0,
			granted: 0,
			...lazyLicensePoolLifecycle,
		},
		contributions: { count: 0 },
		sources: { count: 0 },
	});
});
