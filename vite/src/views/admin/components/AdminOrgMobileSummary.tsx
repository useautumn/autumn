import { OrgClaimState } from "@autumn/shared";
import type { AdminOrg } from "../AdminOrgColumns";
import { AdminOrgUnclaimedDot } from "./AdminOrgUnclaimedDot";

export const AdminOrgMobileSummary = ({ org }: { org: AdminOrg }) => (
	<div className="flex min-w-0 flex-col gap-0.5">
		<div className="flex min-w-0 items-center gap-1.5">
			<span className="truncate">{org.name}</span>
			{org.claim_state === OrgClaimState.Pending && <AdminOrgUnclaimedDot />}
		</div>
		<div className="flex flex-col font-normal text-tertiary-foreground text-xs">
			{org.users.length === 0 && <span>No members</span>}
			{org.users.map((user) => (
				<span className="break-all whitespace-normal" key={user.id}>
					{user.email}
				</span>
			))}
		</div>
	</div>
);
