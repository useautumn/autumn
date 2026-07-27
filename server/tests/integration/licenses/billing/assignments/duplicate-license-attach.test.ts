/** Red: duplicate entities fail or consume capacity.
 * Green: duplicate-only and mixed batches skip assigned entities with 200. */
import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { setupLicenseUpdateScenario } from "../update/setupLicenseUpdateScenario";

test.each([
	{ name: "duplicate-only", includeNew: false, usage: 1 },
	{ name: "mixed duplicate and new", includeNew: true, usage: 2 },
])("license-assign: $name returns 200", async ({ name, includeNew, usage }) => {
	const customerId = `license-assign-${name.replaceAll(" ", "-")}`;
	const { autumnV2_3, devSeat, assignSeats } = await setupLicenseUpdateScenario(
		{
			customerId,
			idPrefix: customerId,
			seatPrice: 20,
			includedSeats: 1,
			attachedSeats: 2,
		},
	);
	await assignSeats({ count: 1 });

	const response = await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [
			{ entity_id: `${customerId}-entity-1` },
			...(includeNew
				? [
						{
							entity_id: `${customerId}-entity-2`,
							feature_id: TestFeature.Users,
						},
					]
				: []),
		],
	});

	expect(response).toEqual({ success: true });
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expect(customer.licenses[0]).toMatchObject({
		granted: 2,
		usage,
		remaining: 2 - usage,
	});
});
