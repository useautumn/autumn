import { expect } from "chai";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectAttachCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { CusService } from "@/internal/customers/CusService.js";

export let pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const testCase = "others6";

describe(`${chalk.yellowBright(`${testCase}: Testing attach with customer ID and entity ID null`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const email = `${customerId}@test.com`;
	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		let customer = await CusService.getByEmail({
			db,
			orgId: org.id,
			env,
			email,
		});

		if (customer.length > 0) {
			await autumn.customers.delete(customer[0].internal_id);
		}

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [pro],
		});
	});

	let internalCustomerId = "";
	let internalEntityId = "";
	let entityId = "1";
	it("should attach create customer with no ID", async function () {
		let customer = await autumn.customers.create({
			// @ts-ignore
			id: null,
			email: `${customerId}@test.com`,
			name: customerId,
		});

		expect(customer.autumn_id, "Customer ID should exist").to.exist;

		internalCustomerId = customer.autumn_id;

		let data = await autumn.entities.create(internalCustomerId, {
			// @ts-ignore
			id: null,
			feature_id: TestFeature.Users,
		});

		internalEntityId = data.autumn_id;

		expect(internalEntityId, "Entity ID should exist").to.exist;
	});

	it("should be able to attach pro product, invoice only", async function () {
		await autumn.attach({
			customer_id: internalCustomerId,
			entity_id: internalEntityId,
			product_id: pro.id,
			invoice: true,
			enable_product_immediately: true,
		});

		const customer = await autumn.customers.get(internalCustomerId);

		expectAttachCorrect({
			customer,
			product: pro,
		});

		expect(customer.invoices.length).to.equal(1);
		expect(customer.invoices[0].status).to.equal("draft");
	});

	it("should create customer with ID, and attach pro product", async function () {
		let customer = await autumn.customers.create({
			id: customerId,
			email: `${customerId}@test.com`,
		});

		expect(customer.autumn_id).to.equal(internalCustomerId);

		let entity = await autumn.entities.create(customer.autumn_id, {
			id: entityId,
			feature_id: TestFeature.Users,
		});

		internalEntityId = entity.autumn_id;

		const customer2 = await autumn.customers.get(customerId);

		expectAttachCorrect({
			customer: customer2,
			product: pro,
			entityId,
		});
	});
});
