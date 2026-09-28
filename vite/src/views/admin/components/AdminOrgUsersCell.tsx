import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import type { User } from "better-auth";
import { AdminEmailWithDomainLink } from "./AdminEmailWithDomainLink";

/** Shows the first email in full plus a hover-expandable count for the rest. */
export const AdminOrgUsersCell = ({ users }: { users: User[] }) => {
	const [firstUser, ...otherUsers] = users;

	if (!firstUser)
		return <span className="text-subtle text-xs">No members</span>;

	return (
		<div className="flex min-w-0 items-center gap-1.5">
			<AdminEmailWithDomainLink
				email={firstUser.email}
				innerClassName="text-xs"
			/>
			{otherUsers.length > 0 && (
				<Tooltip>
					<TooltipTrigger asChild>
						<StatusChip>{`+${otherUsers.length}`}</StatusChip>
					</TooltipTrigger>
					<TooltipContent className="flex flex-col gap-0.5">
						{otherUsers.map((user) => (
							<AdminEmailWithDomainLink key={user.id} email={user.email} />
						))}
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
};
