import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms.js";
import { rewards } from "@tests/utils/fixtures/rewards.js";
import {
	createDashboardSession,
	dashboardGet,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test(`${chalk.yellowBright("customer-referrals: promo-code redemption is excluded from redeemed referrals")}`, async () => {
	const referrerId = "cus-referrals-promo-referrer";
	const redeemerId = "cus-referrals-promo-redeemer";
	const promoCode = "CUSREFERRALSPROMO";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const reward = rewards.halfOff();
	const program = referralPrograms.onCheckoutReferrer({
		rewardId: reward.id,
		productIds: [pro.id],
	});

	const { ctx, redemption } = await initScenario({
		customerId: referrerId,
		setup: [
			s.customer({}),
			s.otherCustomers([{ id: redeemerId }]),
			s.products({ list: [pro] }),
			s.referralProgram({ reward, program }),
			s.featureGrant({
				entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
				promoCodes: [{ code: promoCode }],
			}),
		],
		actions: [
			s.referral.createAndRedeem({ customerId: redeemerId }),
			s.rewards.redeem({ code: promoCode, customerId: redeemerId }),
		],
	});

	const session = await createDashboardSession(ctx);
	try {
		const { status, data } = await dashboardGet<{
			redeemed: { id: string }[];
		}>(ctx, session, `/customers/${redeemerId}/referrals`);

		expect(status).toBe(200);
		expect(data.redeemed.map((r) => r.id)).toEqual([redemption!.id]);
	} finally {
		await session.cleanup();
	}
});
