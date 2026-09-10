import { format } from "date-fns";
import type { AdminUser } from "../AdminUserColumns";

/**
 * Whole mobile card body. The card title truncates by default, so the email is
 * re-rendered here as wrapping text to keep it readable in full.
 */
export const AdminUserMobileSummary = ({ user }: { user: AdminUser }) => (
	<div className="flex min-w-0 flex-col gap-0.5">
		<span className="break-all whitespace-normal">{user.email}</span>
		<span className="font-normal text-tertiary-foreground text-xs">
			{[user.name, format(new Date(user.createdAt), "dd MMM HH:mm")]
				.filter(Boolean)
				.join(" · ")}
		</span>
	</div>
);
