import type { AdminUser } from "../AdminUserColumns";

export const AdminUserMobileSummary = ({ user }: { user: AdminUser }) => (
	<div className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
		<span className="break-all whitespace-normal">{user.email}</span>
		{user.name ? (
			<span className="font-normal text-tertiary-foreground text-xs">
				{user.name}
			</span>
		) : null}
	</div>
);
