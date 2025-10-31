import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addMonths, addYears, differenceInDays } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils.js";
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

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, proAnnual],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, proAnnual],
			db,
			orgId: org.id,
			env,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
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

	it("should attach pro and advance test clock", async () => {
		await autumn.entities.create(customerId, entities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(), 1.5).getTime(),
		});
	});

	it("should attach pro annual to entity 2 and have correct next cycle at", async () => {
		const checkoutRes = await autumn.checkout({
			customer_id: customerId,
			product_id: proAnnual.id,
			entity_id: entities[1].id,
		});

		expect(checkoutRes.next_cycle).to.exist;
		expect(checkoutRes.next_cycle?.starts_at).to.approximately(
			addYears(new Date(), 1).getTime(),
			toMilliseconds.days(1), // +- 1 day
		);

		await autumn.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
			entity_id: entities[1].id,
		});

		const sub = await getCusSub({
			db,
			org,
			customerId,
			productId: proAnnual.id,
		});

		const periodEndExists = sub!.items.data.some(
			(item) =>
				Math.abs(
					differenceInDays(
						item.current_period_end * 1000,
						checkoutRes.next_cycle?.starts_at!,
					),
				) < 1,
		);

		expect(periodEndExists).to.be.true;
	});
});
