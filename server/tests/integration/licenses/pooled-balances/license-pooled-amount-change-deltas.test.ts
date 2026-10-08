// Contract: parent switch where the paired seat plan's pooled allowance changes (200 <-> 400)
// patches contributions by delta and updates the pool aggregate; link_id is stable.

import { test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	amountChangePlans,
	SEAT_COUNT,
} from "./utils/licensePooledAmountChange.js";
import {
	expectLicensePooledGrant,
	LICENSE_POOLED_HIGH_GRANT,
	LICENSE_POOLED_LOW_GRANT,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const CUSTOM_POOLED_GRANT = 600;

test.concurrent(
	`${chalk.yellowBright("license pooled: spare seats take the parent-upgrade delta")}`,
	async () => {
		const { pro, premium, seatLow, seatHigh } = amountChangePlans({
			prefix: "lic-pool-amt-spare",
		});
		const customerId = "lic-pool-amt-spare";
		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({ list: [pro, premium, seatLow, seatHigh] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatLow.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatHigh.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
				s.licenses.assign({
					licenseProductId: seatLow.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatLow.id,
		});
		await autumnV2_3.licenses.release({
			customer_id: customerId,
			license_plan_id: seatLow.id,
			entity_ids: [entities[0].id],
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_HIGH_GRANT,
			seatCount: SEAT_COUNT,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: unassigned seats take the 200→400 parent-upgrade delta")}`,
	async () => {
		const { pro, premium, seatLow, seatHigh } = amountChangePlans({
			prefix: "lic-pool-amt-unassigned",
		});
		const customerId = "lic-pool-amt-unassigned";
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, premium, seatLow, seatHigh] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatLow.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatHigh.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatLow.id,
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
			contributionCount: 0,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_HIGH_GRANT,
			seatCount: SEAT_COUNT,
			contributionCount: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: first customize resizes unassigned pool from 3×400 to 3×600")}`,
	async () => {
		const prefix = "lic-pool-amt-custom";
		const parent = products.base({
			id: `${prefix}-premium`,
			items: [items.monthlyPrice({ price: 50 }), items.dashboard()],
		});
		const seat = pooledSeatPlan({
			id: `${prefix}-seat`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_HIGH_GRANT,
			}),
			group: `${prefix}-seats`,
		});
		const customerId = "lic-pool-amt-custom-first";
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seat.id,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 50 }),
				items: [itemsV2.dashboard()],
				upsert_licenses: [
					{
						license_plan_id: seat.id,
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [
								{
									...itemsV2.monthlyMessages({
										included: CUSTOM_POOLED_GRANT,
									}),
									pooled: true,
								},
							],
						},
					},
				],
			},
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: CUSTOM_POOLED_GRANT,
			seatCount: SEAT_COUNT,
			contributionCount: 0,
		});
	},
);
