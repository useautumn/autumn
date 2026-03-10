import { ErrCode, RecaseError } from "@shared/index";
import { StatusCodes } from "http-status-codes";

export const validatePropertyPathForJSON = ({
	propertyKey,
}: {
	propertyKey: string;
}) => {
	// Validate property path segments are alphanumeric/underscore only
	const pathSegments = propertyKey.split(".");
	for (const segment of pathSegments) {
		if (!/^[a-zA-Z0-9_]+$/.test(segment)) {
			throw new RecaseError({
				message:
					"Invalid property path. Should only contain alphanumeric and underscore characters.",
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
