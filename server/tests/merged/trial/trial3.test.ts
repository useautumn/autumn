import {
	type AppEnv,
	CusProductStatus,
	type FullCusProduct,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// Pro Trial
// Trial Finishes
// Premium Trial

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	trial: true,
});

const ops = [
	{
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Trialing }],
	},
	// {
	//   entityId: "2",
	//   product: premium,
	//   results: [{ product: premium, status: CusProductStatus.Active }],
	// },
];

const testCase = "trial3";
describe(`${chalk.yellowBright("trial3: Testing cancel trial product")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

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
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro],
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

	it("should attach first trial, and advance clock past trial", async () => {
		for (const op of ops) {
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				db,
				org,
				env,
			});
		}

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Trialing,
		});
	});

	let cusProduct: FullCusProduct;

	it("should have canceled trial product at the end of cycle", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
		});

		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
		});

		cusProduct = fullCus.customer_products.find(
			(p) => p.product.id === pro.id,
		)!;
		const sub = await cusProductToSub({
			cusProduct,
			stripeCli,
		});
		// console.log(`cancel at period end: ${sub?.cancel_at_period_end}`);
		// console.log(`cancel at: ${sub?.cancel_at}`);
		// console.log(`canceled at: ${sub?.canceled_at}`);
		const canceled = sub?.canceled_at || sub?.cancel_at;
		expect(canceled).to.exist;
	});

	it("should have sub not canceled if renew product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const sub = await cusProductToSub({
			cusProduct,
			stripeCli,
		});
		expect(sub?.cancel_at_period_end).to.equal(false);
	});
	it("should be canceled completely", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			cancel_immediately: true,
		});

		const customer = await autumn.customers.get(customerId);
		const proProduct = customer.products.find((p) => p.id === pro.id)!;
		expect(proProduct).to.not.exist;

		const sub = await cusProductToSub({
			cusProduct,
			stripeCli,
		});
		expect(sub?.status).to.equal("canceled");
	});
});
