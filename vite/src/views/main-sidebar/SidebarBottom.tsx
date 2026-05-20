"use client";

import { BooksIcon, DiscordLogoIcon } from "@phosphor-icons/react";
import { useEnv } from "@/utils/envUtils";
import { WorkbenchButton } from "@/views/customers2/customer/workbench/WorkbenchButton";
import { FeedbackDialog } from "./FeedbackDialog";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";
import { useSidebarContext } from "./SidebarContext";

export default function SidebarBottom() {
	const env = useEnv();
	const { expanded } = useSidebarContext();

	return (
		<div className="">
			<div className="px-2 flex flex-col gap-1 mb-2">
				<WorkbenchButton />
				<NavButton
					value="docs"
					icon={<BooksIcon size={16} weight="duotone" />}
					title="Docs"
					env={env}
					href="https://docs.useautumn.com"
				/>
				<FeedbackDialog />
				<NavButton
					value="discord"
					icon={<DiscordLogoIcon size={16} weight="duotone" />}
					title="Discord"
					online={expanded}
					env={env}
					href="https://discord.gg/STqxY92zuS"
				/>
				<SidebarContact />
			</div>
		</div>
	);
}
