import { beforeAll, describe, expect, it } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	type FullCusProduct,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;
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
		expect(canceled).toBeDefined();
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
		expect(sub?.cancel_at_period_end).toBe(false);
	});
	it("should be canceled completely", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: pro.id,
			cancel_immediately: true,
		});

		const customer = await autumn.customers.get(customerId);
		const proProduct = customer.products.find((p) => p.id === pro.id);
		expect(proProduct).toBeUndefined();

		const sub = await cusProductToSub({
			cusProduct,
			stripeCli,
		});
		expect(sub?.status).toBe("canceled");
	});
});
