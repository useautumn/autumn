import { RecaseError } from "../../../api/errors/base/RecaseError.js";
import { ErrCode } from "../../../enums/ErrCode.js";

export const invalidCreditRateCard = ({
	featureId,
	creditSystemId,
	message,
}: {
	featureId: string;
	creditSystemId: string;
	message: string;
}) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: { featureId, creditSystemId },
	});
