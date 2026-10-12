import type { AdminUser } from "../AdminUserColumns";
import { AdminEmailDomainLink } from "./AdminEmailDomainLink";

export const AdminUserMobileSummary = ({ user }: { user: AdminUser }) => (
	<div className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
		<div className="flex min-w-0 items-center gap-1.5">
			<span className="min-w-0 break-all whitespace-normal">{user.email}</span>
			<AdminEmailDomainLink email={user.email} />
		</div>
		{user.name ? (
			<span className="font-normal text-tertiary-foreground text-xs">
				{user.name}
			</span>
		) : null}
	</div>
);
