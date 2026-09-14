import { OrgClaimState } from "@autumn/shared";
import { useIsMobile } from "@autumn/ui";
import type { AdminOrg } from "../AdminOrgColumns";
import { AdminOrgMobileSummary } from "./AdminOrgMobileSummary";
import { AdminOrgUnclaimedDot } from "./AdminOrgUnclaimedDot";

export const AdminOrgNameCell = ({ org }: { org: AdminOrg }) => {
	const isMobile = useIsMobile();
	if (isMobile) return <AdminOrgMobileSummary org={org} />;

	return (
		<div className="flex min-w-0 items-center gap-1.5">
			<span className="truncate font-medium text-foreground">{org.name}</span>
			{org.claim_state === OrgClaimState.Pending && <AdminOrgUnclaimedDot />}
		</div>
	);
};
