import type { RoleAccessMap } from "@autumn/shared";

type MemberRoleRow = { role: string; customAccess?: RoleAccessMap | null };

/** Stands in for the joined member/role select in getScopesForUserInOrg; `null` means not a member. */
export const fakeMemberRoleDb = ({
	getMember,
}: {
	getMember: () => MemberRoleRow | null;
}) => {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		limit: async () => {
			const row = getMember();
			return row ? [{ customAccess: null, ...row }] : [];
		},
	};
	return { select: () => chain };
};
