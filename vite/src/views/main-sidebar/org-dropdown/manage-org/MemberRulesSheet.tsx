import type { Membership } from "@autumn/shared";
import {
	Button,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";
import { useRolesQuery } from "@/hooks/queries/useRolesQuery";
import { RulesThatIncludeSection } from "@/views/settings/sections/approvals/RulesThatIncludeSection";
import { roleLabel } from "@/views/settings/sections/roles/roleAccess";

/** A member's role and the approval rules that include them, read only. */
export const MemberRulesSheet = ({
	membership,
	open,
	onOpenChange,
}: {
	membership: Membership;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const { roles } = useRolesQuery();
	const { user } = membership;
	const role = membership.member.role || null;
	const name = user.name || user.email;
	const label = role ? roleLabel({ roles, name: role }) : null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="!w-full !max-w-full sm:!w-[28rem] sm:!max-w-[28rem]"
			>
				<SheetHeader>
					<SheetTitle>{name}</SheetTitle>
					<SheetDescription>{user.email}</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
					<div className="flex flex-col gap-1">
						<span className="font-medium text-tertiary-foreground text-xs">
							Role
						</span>
						<span className="text-foreground text-sm">
							{label ?? "No role"}
						</span>
					</div>
					<RulesThatIncludeSection
						audience={{ type: "user", userId: user.id, role }}
						name={user.name?.split(" ")[0] || name}
						roleLabel={label}
					/>
				</div>
				<div className="mt-auto flex border-t px-4 pt-4 pb-4">
					<Button
						variant="secondary"
						className="flex-1"
						onClick={() => onOpenChange(false)}
					>
						Close
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
};
