"use client";

import { BookOpen, Settings2 } from "lucide-react";
import { useEnv } from "@/utils/envUtils";
import { WorkbenchButton } from "@/views/customers2/customer/workbench/WorkbenchButton";
import { OnboardingCard } from "./components/OnboardingCard";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";
import { SIDEBAR_ICON_STROKE } from "./sidebarRowClass";

export default function SidebarBottom() {
	const env = useEnv();

	return (
		<div className="flex flex-col gap-px pt-4">
			<OnboardingCard />
			<div className="flex flex-col gap-px">
				<NavButton
					value="settings"
					icon={<Settings2 strokeWidth={SIDEBAR_ICON_STROKE} />}
					title="Settings"
					env={env}
				/>
				<WorkbenchButton />
				<NavButton
					value="docs"
					icon={<BookOpen strokeWidth={1.5} />}
					title="Docs"
					env={env}
					href="https://docs.useautumn.com"
				/>
				<SidebarContact />
			</div>
		</div>
	);
}
