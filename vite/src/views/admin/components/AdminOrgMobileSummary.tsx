import { OrgClaimState } from "@autumn/shared";
import {
	Button,
	MiniCopyButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { format } from "date-fns";
import type { AdminOrg } from "../AdminOrgColumns";
import { AdminOrgStatusCell } from "./AdminOrgStatusCell";
import { AdminOrgUnclaimedDot } from "./AdminOrgUnclaimedDot";

export const AdminOrgMobileSummary = ({ org }: { org: AdminOrg }) => (
	<div className="flex min-w-0 flex-col gap-0.5">
		<div className="flex min-w-0 items-center gap-1.5">
			<span className="truncate">{org.name}</span>
			{org.claim_state === OrgClaimState.Pending && <AdminOrgUnclaimedDot />}
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="ghost" size="sm" className="ml-auto">
						Details
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" aria-label="Organization details">
					<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-xs">
						<dt>Status</dt>
						<dd>
							<AdminOrgStatusCell org={org} />
						</dd>
						<dt>Slug</dt>
						<dd className="min-w-0">
							<MiniCopyButton text={org.slug} innerClassName="text-xs" />
						</dd>
						<dt>Created</dt>
						<dd className="tabular-nums">
							{format(new Date(org.createdAt), "dd MMM HH:mm")}
						</dd>
						<dt>ID</dt>
						<dd className="min-w-0 font-mono">
							<MiniCopyButton text={org.id} innerClassName="text-xs" />
						</dd>
					</dl>
				</PopoverContent>
			</Popover>
		</div>
		<div className="flex flex-col font-normal text-tertiary-foreground text-xs">
			{org.users.length === 0 && <span>No members</span>}
			{org.users.map((user) => (
				<span className="break-all whitespace-normal" key={user.id}>
					{user.email}
				</span>
			))}
		</div>
	</div>
);
