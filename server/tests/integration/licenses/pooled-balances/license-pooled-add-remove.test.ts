/**
 * Contract: parent switch that adds or removes a pooled seat item mints or
 * expires that feature's license pool in batch SQL. Existing pools on the
 * link stay put. Source balances stay 0. link_id is stable.
 *
 *   immediate add → new words pool, granted = N × 100
 *   spare seats are in scope (release does not drop the new contribution)
 *   scheduled remove → words pool unchanged until activation, then expires
 */

import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_ADDED_GRANT,
	LICENSE_POOLED_LOW_GRANT,
	expectLicensePooledBalanceExpired,
	expectLicensePooledGrant,
	pooledMonthlyMessages,
	pooledMonthlyWords,
	pooledSeatPlan,
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

const SEAT_COUNT = 3;

const addRemovePlans = ({ prefix }: { prefix: string }) => {
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
		seatMessages: pooledSeatPlan({
			id: `${prefix}-seat-messages`,
			item: pooledMonthlyMessages({
				includedUsage: LICENSE_POOLED_LOW_GRANT,
			}),
			group: seatGroup,
		}),
		seatMessagesAndWords: pooledSeatPlan({
			id: `${prefix}-seat-messages-words`,
			items: [
				pooledMonthlyMessages({
					includedUsage: LICENSE_POOLED_LOW_GRANT,
				}),
				pooledMonthlyWords({
					includedUsage: LICENSE_POOLED_ADDED_GRANT,
				}),
			],
			group: seatGroup,
		}),
	};
};

test.concurrent(
	`${chalk.yellowBright("license pooled: immediate parent upgrade mints a pool for the added item")}`,
	async () => {
		const { pro, premium, seatMessages, seatMessagesAndWords } =
			addRemovePlans({ prefix: "lic-pool-add" });
		const customerId = "lic-pool-add-item";
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({
					list: [pro, premium, seatMessages, seatMessagesAndWords],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatMessages.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatMessagesAndWords.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
				s.licenses.assign({
					licenseProductId: seatMessages.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatMessages.id,
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

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		await expectCustomerProducts({ customer, active: [premium.id] });
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_LOW_GRANT,
			seatCount: SEAT_COUNT,
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_ADDED_GRANT,
			seatCount: SEAT_COUNT,
			featureId: TestFeature.Words,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: spare seats take the added pooled item")}`,
	async () => {
		const { pro, premium, seatMessages, seatMessagesAndWords } =
			addRemovePlans({ prefix: "lic-pool-add-spare" });
		const customerId = "lic-pool-add-spare";
		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({
					list: [pro, premium, seatMessages, seatMessagesAndWords],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatMessages.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatMessagesAndWords.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: pro.id }),
				s.licenses.assign({
					licenseProductId: seatMessages.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatMessages.id,
		});
		await autumnV2_3.licenses.release({
			customer_id: customerId,
			license_plan_id: seatMessages.id,
			entity_ids: [entities[0].id],
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
			grantPerSeat: LICENSE_POOLED_ADDED_GRANT,
			seatCount: SEAT_COUNT,
			featureId: TestFeature.Words,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license pooled: scheduled parent downgrade expires the removed item's pool at activation")}`,
	async () => {
		const { pro, premium, seatMessages, seatMessagesAndWords } =
			addRemovePlans({ prefix: "lic-pool-rm-sched" });
		const customerId = "lic-pool-remove-scheduled";
		const { autumnV2_3, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({
					list: [pro, premium, seatMessages, seatMessagesAndWords],
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seatMessages.id,
					included: SEAT_COUNT,
				}),
				s.licenses.link({
					parentProductId: premium.id,
					licenseProductId: seatMessagesAndWords.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: premium.id }),
				s.licenses.assign({
					licenseProductId: seatMessagesAndWords.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});
		if (!testClockId) throw new Error("Test clock not enabled");

		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: seatMessagesAndWords.id,
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: LICENSE_POOLED_ADDED_GRANT,
			seatCount: SEAT_COUNT,
			featureId: TestFeature.Words,
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
			grantPerSeat: LICENSE_POOLED_ADDED_GRANT,
			seatCount: SEAT_COUNT,
			featureId: TestFeature.Words,
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
		await expectLicensePooledBalanceExpired({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			featureId: TestFeature.Words,
		});
	},
);
