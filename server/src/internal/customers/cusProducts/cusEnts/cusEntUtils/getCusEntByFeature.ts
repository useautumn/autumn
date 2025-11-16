import type {
	AppEnv,
	FullCustomerEntitlement,
	Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "../../../../../db/initDrizzle.js";
import { CusService } from "../../../CusService.js";

export const getCusEntByFeature = async ({
	db,
	org,
	env,
	customerId,
	featureId,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customerId: string;
	featureId: string;
}) => {
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
	});

	const cusEnts = fullCus?.customer_products
		.flatMap((cp) => cp.customer_entitlements)
		.filter(
			(ce: FullCustomerEntitlement) => ce.entitlement.feature_id === featureId,
		);

	return cusEnts?.[0];
};
