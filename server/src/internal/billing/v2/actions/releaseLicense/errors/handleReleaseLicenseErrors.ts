import { ErrCode, findDuplicate, RecaseError } from "@autumn/shared";
import type { ReleaseLicenseContext } from "../types.js";

export const handleReleaseLicenseErrors = ({
	context,
}: {
	context: ReleaseLicenseContext;
}) => {
	const duplicateEntityId = findDuplicate(context.entityIds);
	if (duplicateEntityId !== undefined) {
		throw new RecaseError({
			message: `Duplicate entity ${duplicateEntityId} in entity_ids.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
