import { ErrCode, isBuiltInRole, RecaseError } from "@autumn/shared";

/** Built-in roles are defined in code, so they can't be edited or deleted. */
export const handleBuiltInRoleErrors = ({ name }: { name: string }) => {
	if (!isBuiltInRole(name)) return;

	throw new RecaseError({
		message: `${name} is a built-in role and can't be changed. Create a custom role instead.`,
		code: ErrCode.RoleBuiltIn,
		statusCode: 400,
	});
};
