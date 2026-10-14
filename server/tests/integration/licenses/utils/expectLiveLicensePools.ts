import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { listLicensePools } from "../licenseTestUtils.js";
import { assertLicensesMatch } from "./expectCustomerLicenses.js";

export const expectLiveLicensePools = async ({
	autumn,
	customerId,
	entityId,
	pools,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId?: string;
	pools: (Partial<ApiCustomerLicenseV0> &
		Pick<ApiCustomerLicenseV0, "license_plan_id">)[];
}) => {
	const actual = await listLicensePools({ autumn, customerId, entityId });
	assertLicensesMatch({ actual, licenses: pools, count: pools.length });
};
