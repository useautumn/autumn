import { useIsMobile } from "@autumn/ui";
import type { AdminUser } from "../AdminUserColumns";
import { AdminEmailWithDomainLink } from "./AdminEmailWithDomainLink";
import { AdminUserMobileSummary } from "./AdminUserMobileSummary";

export const AdminUserEmailCell = ({ user }: { user: AdminUser }) => {
	const isMobile = useIsMobile();
	if (isMobile) return <AdminUserMobileSummary user={user} />;

	return (
		<AdminEmailWithDomainLink
			email={user.email}
			innerClassName="text-foreground"
		/>
	);
};
