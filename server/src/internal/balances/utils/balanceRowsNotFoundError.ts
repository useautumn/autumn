import { RecaseError } from "@autumn/shared";

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
