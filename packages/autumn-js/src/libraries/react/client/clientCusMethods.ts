import type * as models from "@useautumn/sdk/models";
import type { AutumnClient, CreateCustomerParams } from "./ReactAutumnClient";

export const createCustomerMethod = async ({
	client,
	params,
}: {
	client: AutumnClient;
	params: CreateCustomerParams;
}): Promise<models.Customer | null> => {
	const result = await client.post(`${client.prefix}/customers`, params);
	return result;
};
