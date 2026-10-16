import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@autumn/ui";
import { useState } from "react";
import { useInNamedSandbox } from "@/hooks/sandbox/useInNamedSandbox";
import { InvitePopover } from "@/views/main-sidebar/org-dropdown/manage-org/InvitePopover";
import { OrgInvitesList } from "@/views/main-sidebar/org-dropdown/manage-org/OrgInvitesList";
import { OrgMembersList } from "@/views/main-sidebar/org-dropdown/manage-org/OrgMembersList";
import { SettingsSection } from "../SettingsSection";
import { RolesTab } from "./roles/RolesTab";
import { useRoleDialogs } from "./roles/useRoleDialogs";

type MembersTab = "members" | "invites" | "roles";

const TABS: { value: MembersTab; label: string }[] = [
	{ value: "members", label: "Members" },
	{ value: "invites", label: "Pending invites" },
	{ value: "roles", label: "Roles" },
];

export const MembersSection = () => {
	const inNamedSandbox = useInNamedSandbox();
	const [tab, setTab] = useState<MembersTab>("members");
	const roleDialogs = useRoleDialogs();

	const headerAction =
		tab === "roles" ? (
			<Button
				variant="primary"
				size="mini"
				onClick={() => roleDialogs.openEditor({ role: null })}
			>
				New role
			</Button>
		) : (
			<InvitePopover />
		);

	return (
		<SettingsSection
			title="Members"
			description={
				inNamedSandbox
					? "Members are inherited from your organization and managed there"
					: "Manage team members, invitations and what each role can do."
			}
			actions={inNamedSandbox ? undefined : headerAction}
		>
			<Tabs value={tab} onValueChange={(value) => setTab(value as MembersTab)}>
				<TabsList variant="underline">
					{TABS.map(({ value, label }) => (
						<TabsTrigger key={value} value={value} variant="underline">
							{label}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value="members" className="mt-8">
					<OrgMembersList />
				</TabsContent>
				<TabsContent value="invites" className="mt-8">
					<OrgInvitesList />
				</TabsContent>
				<TabsContent value="roles" className="mt-8">
					<RolesTab dialogs={roleDialogs} readOnly={inNamedSandbox} />
				</TabsContent>
			</Tabs>
		</SettingsSection>
	);
};
