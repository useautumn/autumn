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

export const ManageOrg = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const [currentTab, setCurrentTab] = useState("user");

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
							className="flex flex-col h-full"
							value={currentTab}
							onValueChange={setCurrentTab}
						>
							<div className="flex justify-between items-center px-6">
								<TabsList className="p-0 flex gap-4 justify-start w-fit !bg-transparent">
									<TabsTrigger className="" value="user">
										User
									</TabsTrigger>
									<TabsTrigger className="" value="organization">
										Organization
									</TabsTrigger>
									<TabsTrigger className="" value="members">
										Members
									</TabsTrigger>
									<TabsTrigger className="" value="invites">
										Invites
									</TabsTrigger>
								</TabsList>
								{(currentTab === "members" || currentTab === "invites") && (
									<InvitePopover />
								)}
							</div>

							<TabsContent value="user" className="h-full overflow-y-auto">
								<UserDetails />
							</TabsContent>

							<TabsContent value="organization" className="h-full overflow-y-auto">
								<OrgDetails />
							</TabsContent>

							<TabsContent value="members" className="h-full overflow-y-auto">
								<OrgMembersList />
							</TabsContent>
							<TabsContent value="invites" className="h-full overflow-y-auto">
								<OrgInvitesList />
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
