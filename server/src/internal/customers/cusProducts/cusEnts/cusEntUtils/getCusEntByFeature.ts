import type { FullCustomerEntitlement } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "../../../CusService.js";

export const getCusEntByFeature = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) => {
	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusEnts = fullCus?.customer_products
		.flatMap((cp) => cp.customer_entitlements)
		.filter(
			(ce: FullCustomerEntitlement) => ce.entitlement.feature_id === featureId,
		);

	return cusEnts?.[0];
};
