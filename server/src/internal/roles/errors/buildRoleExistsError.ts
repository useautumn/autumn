import { ErrCode, RecaseError } from "@autumn/shared";

export const buildRoleExistsError = ({ name }: { name: string }) =>
	new RecaseError({
		message: `A role named ${name} already exists. Pick another name.`,
		code: ErrCode.RoleExists,
		statusCode: 409,
	});
