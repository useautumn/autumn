import { LegacyVersion } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
		// constructFixedPrice({
		//   price: 0,
		// }),
	],
});

// UNCOMMENT FROM HERE
const testCase = "basic1";
describe(`${chalk.yellowBright("basic1: Testing attach free product")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });
	let db, org, env;

	before(async function () {
		await setupBefore(this);
		db = this.db;
		org = this.org;
		env = this.env;

		await initCustomer({
			autumn: this.autumnJs,
			customerId,
			db,
			org,
			env,
			fingerprint: "test",
			withTestClock: false,
		});

		addPrefixToProducts({
			products: [freeProd],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [freeProd],
		});
	});

	it("should create customer and have default free active", async () => {
		const data = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.free,
			cusRes: data,
		});
	});

	it("should have correct entitlements", async () => {
		const expectedEntitlement = products.free.entitlements.metered1;

		const entitled = (await AutumnCli.entitled(
			customerId,
			features.metered1.id,
		)) as any;

		const metered1Balance = entitled.balances.find(
			(balance: any) => balance.feature_id === features.metered1.id,
		);

		expect(entitled.allowed).to.be.true;
		expect(metered1Balance).to.exist;
		expect(metered1Balance.balance).to.equal(expectedEntitlement.allowance);
		expect(metered1Balance.unlimited).to.not.exist;
	});

	it("should have correct boolean1 entitlement", async () => {
		const entitled = await AutumnCli.entitled(customerId, features.boolean1.id);
		expect(entitled!.allowed).to.be.false;
	});

	it("should attach free (with $0 price) and force checkout and succeed", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: freeProd.id,
			force_checkout: true,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: freeProd,
		});

		expectFeaturesCorrect({
			customer,
			product: freeProd,
		});
	});
});
