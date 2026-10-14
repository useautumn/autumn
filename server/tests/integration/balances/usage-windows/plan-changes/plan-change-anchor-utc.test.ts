import { expect, test } from "bun:test";
import {
	ApiVersion,
	EntInterval,
	getUsageWindowBounds,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	fetchActivePlanCusEnt,
	fetchUsageWindowRows,
} from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("uw-anchor-utc1: a utc cap uses calendar bounds despite an active plan cycle")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-anchor-utc-1";
		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
			interval: ResetInterval.Day,
			anchor: "utc",
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 2,
			limit: 5,
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
			interval: ResetInterval.Day,
			anchor: "utc",
		});

		await timeout(4000);
		const planEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(planEnt?.next_reset_at).toBeTruthy();

		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(windowRows).toHaveLength(1);

		const calendar = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: Date.now(),
		});
		expect(Number(windowRows[0].window_start_at)).toBe(calendar.windowStartAt);
		expect(Number(windowRows[0].window_end_at)).toBe(calendar.windowEndAt);
		expect(windowRows[0].anchor_customer_entitlement_id).toBeNull();

		const cycleAligned = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: Date.now(),
			anchor: Number(planEnt.next_reset_at),
		});
		expect(cycleAligned.windowStartAt).not.toBe(calendar.windowStartAt);
	},
);

test.concurrent(
	`${chalk.yellowBright("uw-anchor-utc2: a plan change does not refill a utc-anchored counter")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-anchor-utc-2";
		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
		});
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
			interval: ResetInterval.Day,
			anchor: "utc",
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
			interval: ResetInterval.Day,
			anchor: "utc",
		});
		await timeout(4000);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 2,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 3,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 5,
			limit: 5,
		});

		await timeout(4000);
		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		const calendar = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: Date.now(),
		});
		expect(windowRows).toHaveLength(1);
		expect(Number(windowRows[0].window_start_at)).toBe(calendar.windowStartAt);
		expect(windowRows[0].anchor_customer_entitlement_id).toBeNull();
	},
);
