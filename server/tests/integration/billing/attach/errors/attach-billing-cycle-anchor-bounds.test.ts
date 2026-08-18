import { test } from "bun:test";
import { type AttachParamsV1Input, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

test(`${chalk.yellowBright("attach billing-cycle-anchor bounds: reset stays inside the product lifetime")}`, async () => {
	const customerId = "attach-anchor-bounds";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const { autumnV2_3, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});
	const fiveDaysMs = addDays(advancedTo, 5).getTime();
	const tenDaysMs = addDays(advancedTo, 10).getTime();

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "billing_cycle_anchor must be after the plan starts",
		func: () =>
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				plan_schedule: "end_of_cycle",
				billing_cycle_anchor: tenDaysMs,
			}),
	});
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "billing_cycle_anchor must be after the plan starts",
		func: () =>
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				plan_schedule: "immediate",
				starts_at: tenDaysMs,
				billing_cycle_anchor: fiveDaysMs,
			}),
	});
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "billing_cycle_anchor must be after the plan starts",
		func: () =>
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				plan_schedule: "immediate",
				starts_at: tenDaysMs,
				billing_cycle_anchor: tenDaysMs,
			}),
	});
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "billing_cycle_anchor must be before ends_at",
		func: () =>
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				plan_schedule: "immediate",
				ends_at: fiveDaysMs,
				billing_cycle_anchor: tenDaysMs,
			}),
	});
});
