import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addMonths, addWeeks, addYears } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { toMilliseconds } from "@/utils/timeUtils.js";

const pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const proAnnual = constructProduct({
	id: "proAnnual",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
	isAnnual: true,
});

const testCase = "interval2";
describe(`${chalk.yellowBright("interval2: Should upgrade from pro to pro annual after 1.5 cycles and have correct next cycle at")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, proAnnual],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro and advance test clock", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(addMonths(new Date(), 1), 2).getTime(),
		});
	});

	test("should upgrade to pro annual and have correct next cycle at", async () => {
		const checkoutRes = await autumn.checkout({
			customer_id: customerId,
			product_id: proAnnual.id,
		});

		expect(checkoutRes.next_cycle).toBeDefined();
		expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
			addYears(new Date(), 1).getTime(),
			-Math.log10(toMilliseconds.days(1)), // +- 1 day
		);

		await autumn.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
		});

		const sub = await getCusSub({
			db: ctx.db,
			org: ctx.org,
			customerId,
			productId: proAnnual.id,
		});

		const subItem = sub!.items.data[0];
		expect(subItem.current_period_end * 1000).toBeCloseTo(
			checkoutRes.next_cycle?.starts_at ?? 0,
			-Math.log10(toMilliseconds.days(1)), // +- 1 day
		);
	});
});
