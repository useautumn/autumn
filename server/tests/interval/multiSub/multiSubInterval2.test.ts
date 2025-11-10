import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { addMonths, addYears, differenceInDays } from "date-fns";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
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

const testCase = "multiSubInterval2";
describe(`${chalk.yellowBright("multiSubInterval2: Should attach pro and pro annual to entity mid cycle and have correct next cycle at")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;
	let curUnix: number;

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
		});

		testClockId = testClockId1!;
	});

	const entities = [
		{
			id: "1",
			name: "entity1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "entity2",
			feature_id: TestFeature.Users,
		},
	];

	test("should attach pro and advance test clock", async () => {
		await autumn.entities.create(customerId, entities);

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
			advanceTo: addMonths(new Date(), 1).getTime(),
		});
	});

	test("should attach pro annual to entity 2 and have correct next cycle at", async () => {
		const checkoutRes = await autumn.checkout({
			customer_id: customerId,
			product_id: proAnnual.id,
			entity_id: entities[1].id,
		});

		expect(checkoutRes.next_cycle).toBeDefined();
		const expectedDate = addYears(Date.now(), 1).getTime();
		const actualDate = checkoutRes.next_cycle?.starts_at!;

		const daysDiff = Math.abs(differenceInDays(expectedDate, actualDate));

		expect(daysDiff).toBeLessThanOrEqual(1);

		await autumn.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
			entity_id: entities[1].id,
		});

		const sub = await getCusSub({
			db: ctx.db,
			org: ctx.org,
			customerId,
			productId: proAnnual.id,
		});

		const subItem = sub!.items.data[0];
		expect(subItem.current_period_end * 1000).toBeCloseTo(
			checkoutRes.next_cycle?.starts_at!,
			-Math.log10(toMilliseconds.days(1)), // +- 1 day
		);
	});
});
