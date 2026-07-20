import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { CustomerProductTransition } from "../compute/transitions/computeCustomerProductTransition";
import { executeBatchedMutation } from "./executeBatchedMutation";
import { repointLicenseCustomerProductsBatch } from "./sql/repointLicenseCustomerProductsBatch";

export const executeCustomerProductTransition = async ({
	ctx,
	customerLicenseLinkId,
	transition,
}: {
	ctx: AutumnContext;
	customerLicenseLinkId: string;
	transition: CustomerProductTransition;
}) => {
	if (transition.fromInternalProductId === transition.toInternalProductId)
		return 0;

	return executeBatchedMutation({
		db: ctx.db,
		operationName: "Seat customer product repoint",
		executeBatch: ({ db, batchSize }) =>
			repointLicenseCustomerProductsBatch({
				db,
				customerLicenseLinkId,
				transition,
				batchSize,
			}),
	});
};
