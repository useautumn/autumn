import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusExpand } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "track-misc1";

describe(`${chalk.yellowBright("track-misc1: testing track auto creates customer and entity")}`, () => {
	const customerId = "track-misc1";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
			customerId,
		});
	});

	const entityId = `${customerId}-entity-1`;
	test("should auto-create customer and entity when calling track", async () => {
		await autumnV1.track({
			customer_id: customerId,
			customer_data: {
				name: "Test Customer",
				email: "test@test.com",
			},
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			entity_data: {
				name: "Test Entity",
				feature_id: TestFeature.Users,
			},
			value: 5,
		});

		const customer = await autumnV1.customers.get(customerId);
		expect(customer, "customer should be created").toMatchObject({
			id: customerId,
			name: "Test Customer",
			email: "test@test.com",
		});

		const entity = await autumnV1.entities.get(customerId, entityId);
		expect(entity, "entity should be created").toMatchObject({
			id: entityId,
			name: "Test Entity",
		});
	});

	test("get customer with entities, should return created entity?", async () => {
		const customer = await autumnV1.customers.get(customerId, {
			expand: [CusExpand.Entities],
		});

		expect(customer.entities).toBeDefined();
		expect(customer.entities).toHaveLength(1);
		expect(customer.entities?.[0].id).toBe(entityId);
		expect(customer.entities?.[0].name).toBe("Test Entity");
	});
});
