/**
 * Contract: parent switch where the paired seat plan's pooled allowance
 * changes (200 → 400 or 400 → 200) patches contributions by Δ and updates
 * the pool aggregate. Source balances stay 0. link_id is stable.
 *
 *   immediate upgrade → granted = N × 400, usage preserved
 *   spare seats are in scope (release does not drop a contribution)
 *   scheduled downgrade → pool unchanged until activation
 */

import { test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	expectLicensePooledGrant,
	LICENSE_POOLED_HIGH_GRANT,
	LICENSE_POOLED_LOW_GRANT,
	pooledMonthlyMessages,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const SEAT_COUNT = 3;
const USAGE = 50;
const CUSTOM_POOLED_GRANT = 600;

const amountChangePlans = ({ prefix }: { prefix: string }) => {
	const seatGroup = `${prefix}-seats`;
	return {
		pro: products.pro({
			id: `${prefix}-pro`,
			items: [items.dashboard()],
		}),
		premium: products.premium({
			id: `${prefix}-premium`,
			items: [items.dashboard()],
		}),
		seatLow: pooledSeatPlan({
			id: `${prefix}-seat-200`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_LOW_GRANT,
			}),
			group: seatGroup,
		}),
		seatHigh: pooledSeatPlan({
			id: `${prefix}-seat-400`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_HIGH_GRANT,
			}),
			group: seatGroup,
		}),
	};
};

test.concurrent(
	`${chalk.yellowBright("license pooled: immediate parent upgrade applies the 200→400 delta")}`,
	async () => {
		const { pro, premium, seatLow, seatHigh } = amountChangePlans({
			prefix: "lic-pool-amt-up",
		});
		const customerId = "lic-pool-amt-upgrade";
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
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: USAGE,
			},
			{ timeout: 2000 },
		);

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		await expectCustomerProducts({ customer, active: [premium.id] });
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_HIGH_GRANT,
			seatCount: SEAT_COUNT,
			usage: USAGE,
		});
	},
);

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

test.concurrent(
	`${chalk.yellowBright("license pooled: scheduled parent downgrade applies the 400→200 delta at activation")}`,
	async () => {
		const { pro, premium, seatLow, seatHigh } = amountChangePlans({
			prefix: "lic-pool-amt-sched",
		});
		const customerId = "lic-pool-amt-scheduled";
		const { autumnV2_3, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
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
				s.billing.attach({ productId: premium.id }),
				s.licenses.assign({
					licenseProductId: seatHigh.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});
		if (!testClockId) throw new Error("Test clock not enabled");

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatHigh.id,
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_HIGH_GRANT,
			seatCount: SEAT_COUNT,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const scheduled = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({
			customer: scheduled,
			canceling: [premium.id],
			scheduled: [pro.id],
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_HIGH_GRANT,
			seatCount: SEAT_COUNT,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});

		const activated = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({
			customer: activated,
			active: [pro.id],
			notPresent: [premium.id],
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: scheduled unassigned downgrade applies 400→200 at activation")}`,
	async () => {
		const { pro, premium, seatLow, seatHigh } = amountChangePlans({
			prefix: "lic-pool-amt-sched-unassigned",
		});
		const customerId = "lic-pool-amt-scheduled-unassigned";
		const { autumnV2_3, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
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
				s.billing.attach({ productId: premium.id }),
			],
		});
		if (!testClockId) throw new Error("Test clock not enabled");

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatHigh.id,
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

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
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

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
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
	},
);
