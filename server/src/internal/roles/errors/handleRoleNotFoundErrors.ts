import { ErrCode, type organizationRole, RecaseError } from "@autumn/shared";

export const handleRoleNotFoundErrors = ({
	id,
	role,
}: {
	id: string;
	role: typeof organizationRole.$inferSelect | undefined;
}): typeof organizationRole.$inferSelect => {
	if (role) return role;

	throw new RecaseError({
		message: `Role ${id} not found`,
		code: ErrCode.RoleNotFound,
		statusCode: 404,
	});
};
