import type { Membership } from "@autumn/shared";
import { useState } from "react";
import { useIsSettingsTabEnabled } from "@/views/settings/SettingsView";
import { MemberRulesSheet } from "./MemberRulesSheet";

/** The member's email, which opens their approval rules once Approvals is on. */
export const MemberEmail = ({ membership }: { membership: Membership }) => {
	const [open, setOpen] = useState(false);
	const showsRules = useIsSettingsTabEnabled()("approvals");
	if (!showsRules) return membership.user.email;

	return (
		<>
			<button
				type="button"
				className="cursor-pointer hover:underline"
				onClick={() => setOpen(true)}
			>
				{membership.user.email}
			</button>
			<MemberRulesSheet
				membership={membership}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
};
