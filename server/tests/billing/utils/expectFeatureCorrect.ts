import { expect } from "bun:test";
import type { AutumnInt } from "@/external/autumn/autumnCli";

export const expectCustomerFeatureCorrect = async ({
	autumn,
	customerId,
	featureId,
	includedUsage,
	balance,
	usage,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	includedUsage: number;
	balance: number;
	usage: number;
}) => {
	const customer = await autumn.customers.get(customerId);
	const feature = customer.features[featureId];

	expect(feature).toMatchObject({
		included_usage: includedUsage,
		balance,
		usage,
	});
};
