import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { AutumnInt } from "../../src/external/autumn/autumnCli.js";
import { EventService } from "../../src/internal/api/events/EventService.js";
import ctx from "../utils/testInitUtils/createTestContext.js";

export const getV2Balance = async ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}) => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const customer = (await autumnV2.customers.get(
		customerId,
	)) as unknown as ApiCustomer;

	return customer.balances[featureId];
};

export const getCustomerEvents = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	console.log("Fetching customer with autumn id");
	const customer = await autumnV2.customers.get(customerId, {
		with_autumn_id: true,
	});

	const events = await EventService.getByCustomerId({
		db: ctx.db,
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id ?? "",
		env: ctx.env,
		limit: 10000,
	});

	return events;
};
