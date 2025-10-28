import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "../../../src/external/autumn/autumnCli.js";
import { getCusEntByFeature } from "../../../src/internal/customers/cusProducts/cusEnts/cusEntUtils/getCusEntByFeature.js";
import type { TestContext } from "../testInitUtils/createTestContext.js";

export const updateFeatureBalance = async ({
	ctx,
	customerId,
	featureId,
	balance,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	balance: number;
}) => {
	const { db, org, env } = ctx;
	const cusEnt = await getCusEntByFeature({
		db,
		org,
		env,
		customerId,
		featureId,
	});

	const autumn = new AutumnInt({ version: ApiVersion.V1_2 });
	await autumn.updateCusEnt({
		customerId,
		customerEntitlementId: cusEnt.id,
		updates: {
			balance,
		},
	});
};
