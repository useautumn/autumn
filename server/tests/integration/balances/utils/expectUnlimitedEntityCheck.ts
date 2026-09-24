import { expect } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const expectUnlimitedEntityCheck = async ({
	autumn,
	customerId,
	entityId,
	featureId,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	featureId: string;
}) => {
	const response = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: featureId,
	});

	expect(response).toMatchObject({
		allowed: true,
		balance: { unlimited: true },
	});
};
