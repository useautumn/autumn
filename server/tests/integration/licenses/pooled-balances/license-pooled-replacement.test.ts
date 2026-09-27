import { test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachLicenseParamsV0,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { expectLicensePooledIdentityCorrect } from "./utils/expectLicensePooledIdentityCorrect.js";
import {
	expectLicensePooledCheck,
	expectLicensePooledEntitlementHydrated,
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

test.concurrent(
	"license pooled: version upgrade adds one pool for an unassigned license",
	async () => {
		const customerId = "lic-pool-version-unassigned";
		const pro = products.pro({
			id: "lic-pool-version-parent",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const seat = products.base({
			id: "lic-pool-version-seat",
			items: [items.dashboard()],
			group: "lic-pool-version-seats",
		});
		const pooledSeat = pooledSeatPlan({
			id: "lic-pool-version-pooled-seat",
			item: pooledMonthlyMessages({ includedUsage: 1000 }),
			group: "lic-pool-version-seats",
		});
		const { autumnV2_4, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pro, seat, pooledSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({ productId: pro.id }),
			],
		});
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});
		await expectLicensePooledEntitlementNotHydrated({
			ctx,
			customerId,
			customerLicenseLinkId,
		});

		await autumnV2_4.post("/plans.update", {
			plan_id: pro.id,
			items: [itemsV2.dashboard()],
			licenses: [{ license_plan_id: pooledSeat.id, included: 1 }],
			force_version: true,
		});
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			version: 2,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
		await expectLicensePooledGrant({
			autumn: autumnV2_4,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 1000,
			seatCount: 1,
			contributionCount: 0,
		});
		await expectLicensePooledEntitlementHydrated({
			ctx,
			customerId,
			customerLicenseLinkId,
		});
		const poolBeforeAssignment = await expectLicensePooledIdentityCorrect({
			ctx,
			customerId,
			customerLicenseLinkId,
		});

		await autumnV2_4.licenses.attach<AttachLicenseParamsV0>({
			customer_id: customerId,
			plan_id: pooledSeat.id,
			entities: [{ entity_id: entities[0].id }],
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_4,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 1000,
			seatCount: 1,
			contributionCount: 1,
		});
		await expectLicensePooledIdentityCorrect({
			ctx,
			customerId,
			customerLicenseLinkId,
			previousPool: poolBeforeAssignment,
		});
	},
);
