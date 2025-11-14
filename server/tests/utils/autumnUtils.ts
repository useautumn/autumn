import type { ApiCustomerV1 } from "@shared/api/customers/previousVersions/apiCustomerV1";
import { expect } from "chai";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const checkBalance = async ({
	autumn,
	featureId,
	customerId,
	expectedBalance,
}: {
	autumn: AutumnInt;
	featureId: string;
	customerId: string;
	expectedBalance: number;
}) => {
	const { entitlements } = (await autumn.customers.get(
		customerId,
	)) as unknown as ApiCustomerV1;
	const entitlement = entitlements.find((e: any) => e.feature_id === featureId);

	expect(entitlement?.balance).to.equal(expectedBalance);
};
