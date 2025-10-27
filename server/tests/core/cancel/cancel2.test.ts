import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
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
});

const wordsUsage = 300000;
const ops = [
	{
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
];

const testCase = "cancel2";
describe(`${chalk.yellowBright("cancel2: Testing cancel at period end (with usage)")}`, () => {
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

	it("should run operations", async () => {
		await autumn.entities.create(customerId, entities);

		for (let index = 0; index < ops.length; index++) {
			const op = ops[index];
			try {
				await attachAndExpectCorrect({
					autumn,
					customerId,
					product: op.product,
					stripeCli,
					db,
					org,
					env,
				});
			} catch (error) {
				console.log(`Operation failed: ${op.product.id}, index: ${index}`);
				throw error;
			}
		}
	});

	it("should track usage cancel, advance test clock and have correct invoice", async () => {
		const cus1 = await autumn.customers.get(customerId);
		const prod = cus1.products.find((p) => p.id === premium.id);
		const proration = {
			start: prod?.current_period_start!,
			end: prod?.current_period_end!,
		};

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: wordsUsage,
		});

		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			cancel_immediately: false,
		});

		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		const wordsAmount = await getExpectedInvoiceTotal({
			db,
			org,
			env,
			onlyIncludeArrear: true,
			usage: [
				{
					featureId: TestFeature.Words,
					value: wordsUsage,
				},
			],
			stripeCli,
			customerId,
			productId: premium.id,
			expectExpired: true,
		});

		const cus = await autumn.customers.get(customerId);
		const prods = cus.products.filter((p) => p.group == premium.group);
		expect(prods.length).to.equal(0);

		expect(cus.invoices.length).to.equal(2);
		expect(cus.invoices[0].total).to.equal(wordsAmount);
	});
});
