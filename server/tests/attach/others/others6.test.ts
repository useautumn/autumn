import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAttachCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils";

export const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const testCase = "others6";

describe(`${chalk.yellowBright(`${testCase}: Testing attach with customer ID and entity ID null`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const email = `${customerId}@test.com`;
	beforeAll(async () => {
		const customer = await CusService.getByEmail({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			email,
		});

		if (customer.length > 0) {
			await autumn.customers.delete(customer[0].internal_id);
		}

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	let internalCustomerId = "";
	let internalEntityId = "";
	const entityId = "1";
	test("should attach create customer with no ID", async () => {
		const customer = await autumn.customers.create({
			id: null,
			email: `${customerId}@test.com`,
			name: customerId,
			withAutumnId: true,
		});

		expect(customer.autumn_id).toBeDefined();

		internalCustomerId = customer.autumn_id;

		const data = await autumn.entities.create(internalCustomerId, {
			id: null,
			feature_id: TestFeature.Users,
		});

		internalEntityId = data.autumn_id;

		expect(internalEntityId).toBeDefined();
	});

	test("should be able to attach pro product, invoice only", async () => {
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

		expect(customer.invoices!.length).toBe(1);
		expect(customer.invoices![0].status).toBe("draft");
	});

	test("should create customer with ID, and attach pro product", async () => {
		const customer = await autumn.customers.create({
			id: customerId,
			email: `${customerId}@test.com`,
		});

		expect(customer.autumn_id).toBe(internalCustomerId);

		const entity = await autumn.entities.create(customer.id, {
			id: entityId,
			feature_id: TestFeature.Users,
		});

		internalEntityId = entity.autumn_id;

		await timeout(2000);

		const customer2 = await autumn.customers.get(customerId);

		expectAttachCorrect({
			customer: customer2,
			product: pro,
		});

		const entity2 = await autumn.entities.get(customerId, entityId);

		expectAttachCorrect({
			customer: entity2,
			product: pro,
		});
	});
});
