import { MiniCopyButton, useIsMobile } from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { getEmailDomain } from "@/utils/emailUtils";
import type { AdminUser } from "../AdminUserColumns";
import { AdminUserMobileSummary } from "./AdminUserMobileSummary";

export const AdminUserEmailCell = ({ user }: { user: AdminUser }) => {
	const isMobile = useIsMobile();
	if (isMobile) return <AdminUserMobileSummary user={user} />;

	const domain = getEmailDomain({ email: user.email });

	return (
		<div className="group/email flex min-w-0 items-center gap-1">
			<div className="min-w-0">
				<MiniCopyButton text={user.email} innerClassName="text-foreground" />
			</div>
			{domain && (
				<a
					href={`https://${domain}`}
					target="_blank"
					rel="noopener noreferrer"
					title={`Open ${domain}`}
					aria-label={`Open ${domain}`}
					onClick={(event) => event.stopPropagation()}
					className="shrink-0 text-tertiary-foreground opacity-0 transition-opacity hover:text-foreground group-hover/email:opacity-100 focus-visible:opacity-100"
				>
					<ArrowSquareOutIcon className="size-3.5" />
				</a>
			)}
		</div>
	);
};
