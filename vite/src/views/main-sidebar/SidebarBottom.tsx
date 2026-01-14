"use client";

import { BooksIcon, DiscordLogoIcon } from "@phosphor-icons/react";
import { useEnv } from "@/utils/envUtils";
import { FeedbackDialog } from "./FeedbackDialog";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";
import { useSidebarContext } from "./SidebarContext";

export default function SidebarBottom() {
	const env = useEnv();
	const { expanded } = useSidebarContext();
	// const { user, isLoaded } = useUser();

	return (
		<div className="">
			<div className="px-2 flex flex-col gap-1 mb-2">
				{/* <NavButton
          value="integrations/stripe"
          icon={<Blocks size={14} />}
          title="Connect to Stripe"
          env={env}
        /> */}
				{/* {env === AppEnv.Sandbox && (
					<NavButton
						value="onboarding"
						icon={<GraduationCap size={14} />}
						title="Onboarding"
						env={env}
					/>
				)} */}
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
