import { ErrCode, RecaseError } from "@autumn/shared";

export const buildRoleExistsError = ({ id }: { id: string }) =>
	new RecaseError({
		message: `A role with id ${id} already exists. Pick another id.`,
		code: ErrCode.RoleExists,
		statusCode: 409,
	});
