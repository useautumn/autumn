import { LegacyVersion } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addDays } from "date-fns";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils.js";
import { toMilliseconds } from "@/utils/timeUtils.js";

const pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const premium = constructProduct({
	id: "premium",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "premium",
	trial: true,
});

const testCase = "interval3";
describe(`${chalk.yellowBright("interval3: Should upgrade from pro trial to premium trial and have correct next cycle at")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;
	let curUnix: number;

	beforeAll(async () => {
		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
			customerId,
		});
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

		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 3).getTime(),
		});
	});

	test("should upgrade to premium and have correct next cycle at", async () => {
		const checkoutRes = await autumn.checkout({
			customer_id: customerId,
			product_id: premium.id,
		});

		expect(checkoutRes.next_cycle).toBeDefined();
		expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
			addDays(curUnix, 7).getTime(),
			-Math.log10(toMilliseconds.days(1)), // +- 1 day
		);

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const sub = await getCusSub({
			db: ctx.db,
			org: ctx.org,
			customerId,
			productId: premium.id,
		});

		const subItem = sub!.items.data[0];
		expect(subItem.current_period_end * 1000).toBeCloseTo(
			checkoutRes.next_cycle?.starts_at!,
			-Math.log10(toMilliseconds.days(1)), // +- 1 day
		);
	});
});
