import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { BasePriceOperationResult } from "../execute/executeBasePriceOperation";
import type { executeCustomerEntitlementOperations } from "../execute/executeCustomerEntitlementOperations";

type BatchTransitionResult = {
	customerEntitlements: Awaited<
		ReturnType<typeof executeCustomerEntitlementOperations>
	>;
	basePrices: BasePriceOperationResult;
	customerProductsUpdated: number;
};

export const logBatchTransitionResult = ({
	ctx,
	customerLicenseLinkId,
	result,
}: {
	ctx: AutumnContext;
	customerLicenseLinkId: string;
	result: BatchTransitionResult;
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			batchTransitionResult: {
				customerLicenseLinkId,
				...result,
			},
		},
	});
};
