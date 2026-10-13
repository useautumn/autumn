import { OrgClaimState } from "@autumn/shared";
import type { AdminOrg } from "../AdminOrgColumns";
import { formatAdminCreatedAt } from "./AdminCreatedAt";
import { AdminEmailDomainLink } from "./AdminEmailDomainLink";
import { AdminOrgUnclaimedDot } from "./AdminOrgUnclaimedDot";

export const AdminOrgMobileSummary = ({ org }: { org: AdminOrg }) => (
	<div className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
		<div className="flex min-w-0 items-center gap-1.5">
			<span className="truncate">{org.name}</span>
			{org.claim_state === OrgClaimState.Pending && <AdminOrgUnclaimedDot />}
		</div>
		<div className="flex flex-col font-normal text-tertiary-foreground text-xs">
			{org.users.length === 0 && <span>No members</span>}
			{org.users.map((user) => (
				<div className="flex min-w-0 items-center gap-1.5" key={user.id}>
					<span className="min-w-0 break-all whitespace-normal">
						{user.email}
						{user.createdAt ? ` · ${formatAdminCreatedAt(user.createdAt)}` : ""}
					</span>
					<AdminEmailDomainLink email={user.email} />
				</div>
			))}
		</div>
	</div>
);
