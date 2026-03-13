import { expect, test } from "bun:test";
import { type ApiCustomerV3, CustomerExpand } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

test("temp: create entity updates cached customer", async () => {
	const customerId = `temp-cached-customer-${Date.now()}`;
	const entityId = `${customerId}-entity-1`;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.customers.get<ApiCustomerV3>(customerId); // set customer in the cache

	await autumnV1.entitiesV2.create({
		customer_id: customerId,
		entity_id: entityId,
		name: "Temp Entity",
		feature_id: TestFeature.Users,
	});

	const customerFromCache = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{
			expand: [CustomerExpand.Entities],
		},
	);

	expect(customerFromCache.entities).toBeDefined();

	const createdEntity = customerFromCache.entities?.find(
		(entity) => entity.id === entityId,
	);

	expect(createdEntity).toBeDefined();
	expect(createdEntity).toMatchObject({
		id: entityId,
		name: "Temp Entity",
	});
});
