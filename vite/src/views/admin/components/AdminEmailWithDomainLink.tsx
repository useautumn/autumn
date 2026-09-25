import { cn, MiniCopyButton } from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { getEmailDomain } from "@/utils/emailUtils";

const revealOnHover =
	"opacity-0 group-hover/email:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

export const AdminEmailWithDomainLink = ({
	email,
	innerClassName,
}: {
	email: string;
	innerClassName?: string;
}) => {
	const domain = getEmailDomain({ email });

	return (
		<div className="group/email flex min-w-0 items-center gap-1">
			<div className="min-w-0">
				<MiniCopyButton
					text={email}
					innerClassName={innerClassName}
					iconClassName={revealOnHover}
				/>
			</div>
			{domain && (
				<a
					href={`https://${domain}`}
					target="_blank"
					rel="noopener noreferrer"
					title={`Open ${domain}`}
					aria-label={`Open ${domain}`}
					onClick={(event) => event.stopPropagation()}
					className={cn(
						"shrink-0 text-tertiary-foreground transition-opacity hover:text-foreground",
						revealOnHover,
					)}
				>
					<ArrowSquareOutIcon className="size-3.5" />
				</a>
			)}
		</div>
	);
};
