import { expect } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import type { Customer } from "autumn-js";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

export const expectCustomerFeatureCorrect = async ({
	customerId,
	customer: providedCustomer,
	featureId,
	includedUsage,
	balance,
	usage,
}: {
	customerId?: string;
	customer?: Customer;
	featureId: string;
	includedUsage: number;
	balance: number;
	usage: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);
	const feature = customer.features[featureId];

	expect(feature).toMatchObject({
		included_usage: includedUsage,
		balance,
		usage,
	});
};
