import { ErrCode, findDuplicate, RecaseError } from "@autumn/shared";
import type { AttachLicenseContext } from "../types.js";

/** Validates the assignment request before the plan is computed. */
export const handleAttachLicenseErrors = ({
	context,
}: {
	context: AttachLicenseContext;
}) => {
	const { customerLicense, entityParams, newEntityParams } = context;

	const duplicateEntityId = findDuplicate(
		entityParams.map((entityParam) => entityParam.entity_id),
	);
	if (duplicateEntityId !== undefined) {
		throw new RecaseError({
			message: `Duplicate entity ${duplicateEntityId} in entities.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const missingFeature = newEntityParams.find(
		(entityParam) => !entityParam.feature_id,
	);
	if (missingFeature) {
		throw new RecaseError({
			message: `Entity ${missingFeature.entity_id} does not exist. Pass feature_id to create it.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (customerLicense.remaining < entityParams.length) {
		throw new RecaseError({
			message: "No available licenses for this plan.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
