"use client";

import { BookOpen } from "lucide-react";
import { useEnv } from "@/utils/envUtils";
import { WorkbenchButton } from "@/views/customers2/customer/workbench/WorkbenchButton";
import { LeafButton } from "./components/LeafButton";
import { OnboardingCard } from "./components/OnboardingCard";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";

export default function SidebarBottom() {
	const env = useEnv();

	return (
		// One px-2 column for everything, so the card and the collapsed rail's
		// icon sit on the same inset as the nav rows.
		<div className="flex flex-col gap-px pt-4">
			<OnboardingCard />
			<div className="flex flex-col gap-px">
				<LeafButton />
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
