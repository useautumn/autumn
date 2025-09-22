import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	CusProductStatus,
	Organization,
} from "@autumn/shared";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expect } from "chai";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addMonths } from "date-fns";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";

// OPERATIONS:
// PremiumAnnual, Premium
// PremiumAnnual, Pro

let premiumAnnual = constructProduct({
	id: "premiumAnnual",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	isAnnual: true,
});

let premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

let pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const ops = [
	{
		entityId: "1",
		product: premiumAnnual,
		results: [{ product: premiumAnnual, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: premium,
		results: [{ product: premium, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: pro,
		results: [
			{ product: premium, status: CusProductStatus.Active },
			{ product: pro, status: CusProductStatus.Scheduled },
		],
	},
];

const testCase = "mergedDowngrade4";
describe(`${chalk.yellowBright("mergedDowngrade4: Testing advance clock, schedule activates")}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
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
			products: [pro, premium, premiumAnnual],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium, premiumAnnual],
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

	it("should run operations", async function () {
		await autumn.entities.create(customerId, entities);

		for (let index = 0; index < ops.length; index++) {
			const op = ops[index];
			try {
				await autumn.attach({
					customer_id: customerId,
					product_id: op.product.id,
					entity_id: op.entityId,
				});

				const entity = await autumn.entities.get(customerId, op.entityId);
				for (const result of op.results) {
					expectProductAttached({
						customer: entity,
						product: result.product,
						entityId: op.entityId,
					});
				}
				expect(
					entity.products.filter((p: any) => p.group == premium.group).length,
				).to.equal(op.results.length);

				await expectSubToBeCorrect({
					db,
					customerId,
					org,
					env,
				});
			} catch (error) {
				console.log(
					`Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`,
				);
				throw error;
			}
		}
	});

	it("should advance test clock and have correct premium downgraded for entity 2", async function () {
		await advanceToNextInvoice({
			stripeCli,
			testClockId,
		});

		// 1. Check that only
		const results = [
			{
				entityId: "1",
				product: premiumAnnual,
				status: CusProductStatus.Active,
			},
			{ entityId: "2", product: pro, status: CusProductStatus.Active },
		];

		for (const result of results) {
			const entity = await autumn.entities.get(customerId, result.entityId);
			expectProductAttached({
				customer: entity,
				product: result.product,
				status: result.status,
			});

			const products = entity.products.filter(
				(p: any) => p.group == result.product.group,
			);
			expect(products.length).to.equal(1);
		}
	});
});
