import {
	Badge,
	MiniCopyButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import type { User } from "better-auth";

/** Shows the first email in full plus a hover-expandable count for the rest. */
export const AdminOrgUsersCell = ({ users }: { users: User[] }) => {
	const [firstUser, ...otherUsers] = users;

	if (!firstUser)
		return <span className="text-subtle text-xs">No members</span>;

	return (
		<div className="flex min-w-0 items-center gap-1.5">
			<MiniCopyButton text={firstUser.email} innerClassName="text-xs" />
			{otherUsers.length > 0 && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge size="sm" variant="muted" className="shrink-0">
							{`+${otherUsers.length}`}
						</Badge>
					</TooltipTrigger>
					<TooltipContent className="flex flex-col gap-0.5">
						{otherUsers.map((user) => (
							<span key={user.id}>{user.email}</span>
						))}
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
};
