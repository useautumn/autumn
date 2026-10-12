import { MiniCopyButton } from "@autumn/ui";
import { AdminEmailDomainLink } from "./AdminEmailDomainLink";

const revealOnHover =
	"opacity-0 group-hover/email:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

export const AdminEmailWithDomainLink = ({
	email,
	innerClassName,
}: {
	email: string;
	innerClassName?: string;
}) => (
	<div className="group/email flex min-w-0 items-center gap-1">
		<div className="min-w-0">
			<MiniCopyButton
				text={email}
				innerClassName={innerClassName}
				iconClassName={revealOnHover}
			/>
		</div>
		<AdminEmailDomainLink email={email} className={revealOnHover} />
	</div>
);
