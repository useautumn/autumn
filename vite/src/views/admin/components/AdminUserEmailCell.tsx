import { MiniCopyButton, useIsMobile } from "@autumn/ui";
import type { AdminUser } from "../AdminUserColumns";
import { AdminUserMobileSummary } from "./AdminUserMobileSummary";

export const AdminUserEmailCell = ({ user }: { user: AdminUser }) => {
	// The mobile card builds itself from the title cell, so it carries the name
	// and signup date too; every other column opts out of the card.
	const isMobile = useIsMobile();
	if (isMobile) return <AdminUserMobileSummary user={user} />;

	return <MiniCopyButton text={user.email} innerClassName="text-foreground" />;
};
