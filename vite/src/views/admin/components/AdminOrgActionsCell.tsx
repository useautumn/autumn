import { DropdownMenuGroup, DropdownMenuItem } from "@autumn/ui";
import { TableDropdownMenuCell } from "@/components/general/table";
import type { AdminOrg } from "../AdminOrgColumns";
import { getImpersonationUser } from "../adminUtils";
import { AdminImpersonateMenuItem } from "./AdminImpersonateMenuItem";

export const AdminOrgActionsCell = ({
	org,
	onManageRequestBlocks,
	onManageRedis,
}: {
	org: AdminOrg;
	onManageRequestBlocks: (org: AdminOrg) => void;
	onManageRedis: (org: AdminOrg) => void;
}) => {
	const impersonationUser = getImpersonationUser(org.users);

	return (
		<div
			className="flex justify-end"
			onClick={(event) => event.stopPropagation()}
		>
			<TableDropdownMenuCell>
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => onManageRequestBlocks(org)}>
						Block
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onManageRedis(org)}>
						Redis
					</DropdownMenuItem>
					{impersonationUser && (
						<AdminImpersonateMenuItem
							organizationId={org.id}
							userId={impersonationUser.id}
						/>
					)}
				</DropdownMenuGroup>
			</TableDropdownMenuCell>
		</div>
	);
};
