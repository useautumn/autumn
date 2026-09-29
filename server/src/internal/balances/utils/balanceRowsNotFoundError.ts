import { RecaseError } from "@autumn/shared";

/** A delete or recalculation that matched no grant: legacy's wording, shared by both lanes. */
export const balanceRowsNotFoundError = ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId?: string;
}): RecaseError =>
	new RecaseError({
		message: `Balance not found for feature ${featureId} and customer ${customerId}`,
		statusCode: 404,
	});
