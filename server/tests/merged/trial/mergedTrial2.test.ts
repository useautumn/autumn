import {
	APIVersion,
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	trial: true,
});

const _ops = [
	{
		entityId: "1",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	// {
	//   entityId: "2",
	//   product: premium,
	//   results: [{ product: premium, status: CusProductStatus.Active }],
	// },
];

const testCase = "mergedTrial2";
describe(`${chalk.yellowBright("mergedTrial2: Testing add second trial product after first trial ends")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let _curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [premium],
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
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "Entity 2",
			feature_id: TestFeature.Users,
		},
	];

	it("should attach first trial, and advance clock past trial", async () => {
		await autumn.entities.create(customerId, entities);

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: "1",
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 8).getTime(),
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
			entityId: "2",
		});
		// const entity1 = await autumn.entities.get(customerId, "1");
		// const premium1 = entity1.products.find((p: any) => p.id == premium.id);

		// const checkout = await autumn.checkout({
		//   customer_id: customerId,
		//   product_id: premium.id,
		//   entity_id: "2",
		// });

		// const nextCycle = checkout.next_cycle;
		// expect(nextCycle?.starts_at);
		// expect(nextCycle?.starts_at).to.approximately(
		//   premium1?.current_period_end,
		//   60000
		// ); // 1 min

		// await autumn.attach({
		//   customer_id: customerId,
		//   product_id: premium.id,
		//   entity_id: "2",
		// });

		// const entity2 = await autumn.entities.get(customerId, "2");
		// const premium2 = entity2.products.find((p: any) => p.id == premium.id);
		// expect(premium2?.status).to.equal(CusProductStatus.Active);
		// expect(premium2?.current_period_end).to.equal(premium1?.current_period_end);
	});
});
