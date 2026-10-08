// Contract: parent switch where the paired seat plan's pooled allowance changes (200 <-> 400)
// patches contributions by delta and updates the pool aggregate; link_id is stable.

import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
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
	seatLinkId,
} from "./utils/licensePooledBalanceTestUtils.js";

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
