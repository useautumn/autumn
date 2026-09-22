import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";
import { generateId } from "@/utils/genUtils";

test("customers.advance_test_clock rejects missing and unlinked Autumn customers", async () => {
	const missingCustomerId = generateId("clock_missing");
	const unlinkedCustomerId = "billing-clock-unlinked";
	const { autumnV2_2, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId: unlinkedCustomerId })],
		actions: [],
	});
	await expect(
		autumnV2_2.post("/customers.advance_test_clock", {
			customer_id: missingCustomerId,
			frozen_time: Date.now() + 60000,
		}),
	).rejects.toMatchObject({ code: "customer_not_found" });
	await autumnV2_2.customers.create({ id: unlinkedCustomerId });
	const customer = await CusService.get({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: unlinkedCustomerId,
	});
	expect(customer).not.toBeNull();
	expect(customer?.processor?.id).toBeFalsy();
	await expect(
		autumnV2_2.post("/customers.advance_test_clock", {
			customer_id: unlinkedCustomerId,
			frozen_time: Date.now() + 60000,
		}),
	).rejects.toMatchObject({ code: "invalid_request" });
});
