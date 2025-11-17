import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "attach-misc1";

const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1000,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing auto-create customer and entity via attach`)}`, () => {
	const customerId = testCase;
	const entityId = "entity-1";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		// Delete customer if exists
		try {
			await autumn.customers.delete(customerId);
		} catch {
			// Ignore if customer doesn't exist
		}

		// Initialize products
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	test("should auto-create customer and entity when calling attach", async () => {
		// Attach with customer_data and entity_data to auto-create both
		const attachResponse = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityId,
			customer_data: {
				name: "Auto Created Customer",
				email: "autocreated@test.com",
				fingerprint: "test-fingerprint-123",
			},
			entity_data: {
				name: "Auto Created Entity",
				feature_id: TestFeature.Users,
			},
		});

		// Verify attach was successful
		expect(attachResponse).toBeDefined();

		// Verify customer was auto-created
		const customer = await autumn.customers.get(customerId);
		expect(customer).toBeDefined();
		expect(customer.id).toBe(customerId);
		expect(customer.name).toBe("Auto Created Customer");
		expect(customer.email).toBe("autocreated@test.com");
		expect(customer.fingerprint).toBe("test-fingerprint-123");

		// Verify entity was auto-created
		const entity = await autumn.entities.get(customerId, entityId);
		expect(entity).toBeDefined();
		expect(entity.id).toBe(entityId);
		expect(entity.name).toBe("Auto Created Entity");
		expect(entity.customer_id).toBe(customerId);
	});
});
