import { MiniCopyButton, useIsMobile } from "@autumn/ui";
import type { AdminUser } from "../AdminUserColumns";
import { AdminUserMobileSummary } from "./AdminUserMobileSummary";

export const AdminUserEmailCell = ({ user }: { user: AdminUser }) => {
	const isMobile = useIsMobile();
	if (isMobile) return <AdminUserMobileSummary user={user} />;

	return <MiniCopyButton text={user.email} innerClassName="text-foreground" />;
};
