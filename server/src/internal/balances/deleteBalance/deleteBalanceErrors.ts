import { type DeleteBalanceParamsV0, RecaseError } from "@autumn/shared";

export const paidBalanceNotDeletableError = ({
	params,
}: {
	params: DeleteBalanceParamsV0;
}): RecaseError =>
	new RecaseError({
		message: `Cannot delete paid balance for feature ${params.feature_id} and customer ${params.customer_id}`,
		statusCode: 409,
	});

export const pooledBalanceNotDeletableError = ({
	params,
}: {
	params: DeleteBalanceParamsV0;
}): RecaseError =>
	new RecaseError({
		message: `Cannot delete pooled balance for feature ${params.feature_id} and customer ${params.customer_id}. Remove the contributing plans instead.`,
		statusCode: 409,
	});
