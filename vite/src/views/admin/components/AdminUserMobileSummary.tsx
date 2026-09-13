import type { AdminUser } from "../AdminUserColumns";
import { formatAdminCreatedAt } from "./AdminCreatedAt";

export const AdminUserMobileSummary = ({ user }: { user: AdminUser }) => (
	<div className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
		<span className="break-all whitespace-normal">{user.email}</span>
		<span className="font-normal text-tertiary-foreground text-xs">
			{[user.name, formatAdminCreatedAt(user.createdAt)]
				.filter(Boolean)
				.join(" · ")}
		</span>
	</div>
);
