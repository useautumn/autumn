import { cn } from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { getEmailDomain } from "@/utils/emailUtils";

export const AdminEmailDomainLink = ({
	email,
	className,
}: {
	email: string;
	className?: string;
}) => {
	const domain = getEmailDomain({ email });
	if (!domain) return null;

	return (
		<a
			href={`https://${domain}`}
			target="_blank"
			rel="noopener noreferrer"
			title={`Open ${domain}`}
			aria-label={`Open ${domain}`}
			onClick={(event) => event.stopPropagation()}
			className={cn(
				"shrink-0 text-tertiary-foreground transition-opacity hover:text-foreground",
				className,
			)}
		>
			<ArrowSquareOutIcon className="size-3.5" />
		</a>
	);
};
