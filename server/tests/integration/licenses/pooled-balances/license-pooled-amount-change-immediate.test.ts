// Contract: parent switch where the paired seat plan's pooled allowance changes (200 <-> 400)
// patches contributions by delta and updates the pool aggregate; link_id is stable.

import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
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

const USAGE = 50;

const upgradeWithUsage = async ({
	prefix,
	customerId,
	carryOverUsages,
}: {
	prefix: string;
	customerId: string;
	carryOverUsages?: AttachParamsV1Input["carry_over_usages"];
}) => {
	const { pro, premium, seatLow, seatHigh } = amountChangePlans({ prefix });
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
		carry_over_usages: carryOverUsages,
	});

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	await expectCustomerProducts({ customer, active: [premium.id] });
	return { autumnV2_3, ctx, customerLicenseLinkId };
};

test.concurrent(
	`${chalk.yellowBright("license pooled: immediate parent upgrade applies 200→400 and resets usage")}`,
	async () => {
		const customerId = "lic-pool-amt-upgrade";
		const { autumnV2_3, ctx, customerLicenseLinkId } = await upgradeWithUsage({
			prefix: "lic-pool-amt-up",
			customerId,
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
	`${chalk.yellowBright("license pooled: immediate parent upgrade with carry-over keeps usage")}`,
	async () => {
		const customerId = "lic-pool-amt-upgrade-carry";
		const { autumnV2_3, ctx, customerLicenseLinkId } = await upgradeWithUsage({
			prefix: "lic-pool-amt-up-carry",
			customerId,
			carryOverUsages: { enabled: true },
		});
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
