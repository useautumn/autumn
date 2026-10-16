import { ErrCode, type organizationRole, RecaseError } from "@autumn/shared";

export const handleRoleNotFoundErrors = ({
	name,
	role,
}: {
	name: string;
	role: typeof organizationRole.$inferSelect | undefined;
}): typeof organizationRole.$inferSelect => {
	if (role) return role;

	throw new RecaseError({
		message: `Role ${name} not found`,
		code: ErrCode.RoleNotFound,
		statusCode: 404,
	});
};
