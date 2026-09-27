import { test } from "bun:test";
import type {
	AttachLicenseParamsV0,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { expectLicensePooledIdentityCorrect } from "./utils/expectLicensePooledIdentityCorrect.js";
import {
	expectLicensePooledEntitlementHydrated,
	expectLicensePooledEntitlementNotHydrated,
	expectLicensePooledGrant,
	lazyLicensePoolLifecycle,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const runUnassignedAllowanceTransition = async ({
	idPrefix,
	carryOverUsages,
	expectedUsage,
}: {
	idPrefix: string;
	carryOverUsages?: AttachParamsV1Input["carry_over_usages"];
	expectedUsage: number;
}) => {
	const customerId = `${idPrefix}-customer`;
	const pro = products.pro({
		id: `${idPrefix}-pro`,
		items: [items.dashboard()],
	});
	const premium = products.premium({
		id: `${idPrefix}-premium`,
		items: [items.dashboard()],
	});
	const seatLow = pooledSeatPlan({
		id: `${idPrefix}-seat-low`,
		item: pooledMonthlyMessages({ includedUsage: 200 }),
		group: `${idPrefix}-seats`,
	});
	const seatHigh = pooledSeatPlan({
		id: `${idPrefix}-seat-high`,
		item: pooledMonthlyMessages({ includedUsage: 400 }),
		group: `${idPrefix}-seats`,
	});
	const { autumnV2_4, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro, premium, seatLow, seatHigh] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: seatLow.id,
				included: 3,
			}),
			s.licenses.link({
				parentProductId: premium.id,
				licenseProductId: seatHigh.id,
				included: 3,
			}),
			s.billing.attach({ productId: pro.id }),
		],
	});
	const customerLicenseLinkId = await seatLinkId({
		db: ctx.db,
		customerId,
		licenseProductId: seatLow.id,
	});
	await autumnV2_4.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		},
		{ timeout: 2000 },
	);
	await expectLicensePooledGrant({
		autumn: autumnV2_4,
		ctx,
		customerId,
		customerLicenseLinkId,
		grantPerSeat: 200,
		seatCount: 3,
		contributionCount: 0,
		usage: 50,
	});
	const poolBeforeTransition = await expectLicensePooledIdentityCorrect({
		ctx,
		customerId,
		customerLicenseLinkId,
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		redirect_mode: "if_required",
		...(carryOverUsages ? { carry_over_usages: carryOverUsages } : {}),
	});

	await expectCustomerProducts({
		autumn: autumnV2_4,
		customerId,
		active: [premium.id],
		notPresent: [pro.id],
	});
	await expectLicensePooledGrant({
		autumn: autumnV2_4,
		ctx,
		customerId,
		customerLicenseLinkId,
		grantPerSeat: 400,
		seatCount: 3,
		contributionCount: 0,
		usage: expectedUsage,
	});
	await expectLicensePooledIdentityCorrect({
		ctx,
		customerId,
		customerLicenseLinkId,
		previousPool: poolBeforeTransition,
	});
};

test.concurrent(
	"license pooled: parent switch resets usage for never-assigned seats by default",
	async () => {
		await runUnassignedAllowanceTransition({
			idPrefix: "lic-pool-unused-reset",
			expectedUsage: 0,
		});
	},
);

test.concurrent(
	"license pooled: parent switch carries usage for never-assigned seats when enabled",
	async () => {
		await runUnassignedAllowanceTransition({
			idPrefix: "lic-pool-unused-carry",
			carryOverUsages: { enabled: true },
			expectedUsage: 50,
		});
	},
);

test.concurrent(
	"license pooled: scheduled addition grants unassigned seats before their first assignment",
	async () => {
		const customerId = "lic-pool-scheduled-unassigned";
		const pro = products.pro({
			id: "lic-pool-scheduled-add-pro",
			items: [items.dashboard()],
		});
		const premium = products.premium({
			id: "lic-pool-scheduled-add-premium",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "lic-pool-scheduled-add-seat",
			items: [items.dashboard()],
			group: "lic-pool-scheduled-add-seats",
		});
		const pooledSeat = pooledSeatPlan({
			id: "lic-pool-scheduled-add-pooled-seat",
			item: pooledMonthlyMessages({ includedUsage: 1000 }),
			group: "lic-pool-scheduled-add-seats",
		});
		const { autumnV2_4, ctx, entities, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success", testClock: true }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [pro, premium, seat, pooledSeat] }),
				],
				actions: [
					s.licenses.link({
						parentProductId: premium.id,
						licenseProductId: seat.id,
						included: 1,
					}),
					s.licenses.link({
						parentProductId: pro.id,
						licenseProductId: pooledSeat.id,
						included: 1,
					}),
					s.billing.attach({ productId: premium.id }),
				],
			});
		if (!testClockId) throw new Error("Test clock not enabled");
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		await expectCustomerProducts({
			autumn: autumnV2_4,
			customerId,
			canceling: [premium.id],
			scheduled: [pro.id],
		});
		await expectLicensePooledEntitlementNotHydrated({
			ctx,
			customerId,
			customerLicenseLinkId,
		});
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
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

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});

		await expectCustomerProducts({
			autumn: autumnV2_4,
			customerId,
			active: [pro.id],
			notPresent: [premium.id],
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
