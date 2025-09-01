import { expect } from "chai";
import type { Autumn } from "@/external/autumn/autumnCli.js";

export const checkBalance = async ({
	autumn,
	featureId,
	customerId,
	expectedBalance,
}: {
	autumn: Autumn;
	featureId: string;
	customerId: string;
	expectedBalance: number;
}) => {
	const { entitlements } = await autumn.customers.get(customerId);
	const entitlement = entitlements.find((e: any) => e.feature_id === featureId);

	expect(entitlement.balance).to.equal(expectedBalance);
};
