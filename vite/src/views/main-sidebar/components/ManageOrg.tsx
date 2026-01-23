import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/v2/dialogs/Dialog";
import { InvitePopover } from "../org-dropdown/manage-org/InvitePopover";
import { OrgInvitesList } from "../org-dropdown/manage-org/OrgInvitesList";
import { OrgMembersList } from "../org-dropdown/manage-org/OrgMembersList";
import { OrgDetails } from "./OrgDetails";
import { UserDetails } from "./UserDetails";

type ManageOrgTab = "user" | "members" | "invites";

const tabsContentClassName = "h-full overflow-y-auto focus-visible:ring-0";

export const ManageOrg = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const [currentTab, setCurrentTab] = useState<ManageOrgTab>("user");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild></DialogTrigger>
			<DialogContent className="gap-0 p-0 rounded-xs w-[90%] max-w-[650px] h-[450px] flex flex-col justify-between">
				<div className="flex flex-col gap-6 overflow-hidden h-full">
					<DialogHeader className="px-6 pt-6">
						<DialogTitle>Settings</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-6 h-full overflow-hidden">
						<Tabs
							className="flex flex-col h-full focus-visible:ring-none"
							value={currentTab}
							onValueChange={setCurrentTab as (val: string) => void}
						>
							<div className="flex justify-between items-center px-6">
								<TabsList className="p-0 flex gap-4 justify-start w-fit bg-transparent!">
									<TabsTrigger value="user">User</TabsTrigger>
									<TabsTrigger value="organization">Organization</TabsTrigger>
									<TabsTrigger value="members">Members</TabsTrigger>
									<TabsTrigger value="invites">Invites</TabsTrigger>
								</TabsList>
								{(currentTab === "members" || currentTab === "invites") && (
									<InvitePopover />
								)}
							</div>

							<TabsContent value="user" className={tabsContentClassName}>
								<UserDetails />
							</TabsContent>

							<TabsContent
								value="organization"
								className={tabsContentClassName}
							>
								<OrgDetails />
							</TabsContent>

							<TabsContent value="members" className={tabsContentClassName}>
								<OrgMembersList />
							</TabsContent>
							<TabsContent value="invites" className={tabsContentClassName}>
								<OrgInvitesList />
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
