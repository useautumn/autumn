"use client";

import { DiscordLogoIcon } from "@phosphor-icons/react";
import { Book } from "lucide-react";
import { useEnv } from "@/utils/envUtils";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";

export default function SidebarBottom() {
	const env = useEnv();
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
					icon={<Book size={14} />}
					title="Docs"
					env={env}
					href="https://docs.useautumn.com"
				/>
				<NavButton
					value="discord"
					icon={<DiscordLogoIcon size={14} />}
					title="Discord"
					env={env}
					href="https://discord.gg/STqxY92zuS"
				/>
				<SidebarContact />
			</div>
		</div>
	);
}
