import { ErrCode, RecaseError } from "@autumn/shared";

export const handleRoleInUseErrors = ({
	id,
	memberCount,
}: {
	id: string;
	memberCount: number;
}) => {
	if (memberCount === 0) return;

	throw new RecaseError({
		message: `${memberCount} member(s) still have the ${id} role. Move them to another role first.`,
		code: ErrCode.RoleInUse,
		statusCode: 409,
		details: { member_count: memberCount },
	});
};
