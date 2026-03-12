import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { AutumnInt } from "../../src/external/autumn/autumnCli.js";

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
