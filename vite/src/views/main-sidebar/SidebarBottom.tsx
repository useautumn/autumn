"use client";

import { BooksIcon } from "@phosphor-icons/react";
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
		<div className="flex flex-col gap-1 px-2 pt-4">
			<OnboardingCard />
			<div className="flex flex-col gap-1 mb-2">
				<LeafButton />
				<WorkbenchButton />
				<NavButton
					value="docs"
					icon={<BooksIcon size={16} weight="duotone" />}
					title="Docs"
					env={env}
					href="https://docs.useautumn.com"
				/>
				<SidebarContact />
			</div>
		</div>
	);
}
