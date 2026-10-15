import { ErrCode, RecaseError } from "@autumn/shared";
import { isBuiltInRole } from "@autumn/shared/utils/roleUtils/builtInRoles";

/** Built-in roles are defined in code, so they can't be edited or deleted. */
export const handleBuiltInRoleErrors = ({ name }: { name: string }) => {
	if (!isBuiltInRole(name)) return;

	throw new RecaseError({
		message: `${name} is a built-in role and can't be changed. Create a custom role instead.`,
		code: ErrCode.RoleBuiltIn,
		statusCode: 400,
	});
};
