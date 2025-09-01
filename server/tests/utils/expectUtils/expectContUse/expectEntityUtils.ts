import { expect } from "chai";
import { Decimal } from "decimal.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";

export const useEntityBalanceAndExpect = async ({
	autumn,
	customerId,
	featureId,
	entityId,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	entityId: string;
}) => {
	const deduction = new Decimal(Math.random() * 400)
		.toDecimalPlaces(5)
		.toNumber();

	const balanceBefore = await autumn.check({
		customer_id: customerId,
		feature_id: featureId,
		entity_id: entityId,
	});

	await autumn.track({
		customer_id: customerId,
		feature_id: featureId,
		value: deduction,
		entity_id: entityId,
	});
	await timeout(3000);

	const balanceAfter = await autumn.check({
		customer_id: customerId,
		feature_id: featureId,
		entity_id: entityId,
	});

	const expectedBalance = new Decimal(balanceBefore.balance!)
		.sub(deduction)
		.toNumber();

	expect(balanceAfter.balance).to.equal(
		expectedBalance,
		"Entity balance should be correct",
	);
};
