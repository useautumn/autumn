"use client";

import { BooksIcon } from "@phosphor-icons/react";
import { useEnv } from "@/utils/envUtils";
import { WorkbenchButton } from "@/views/customers2/customer/workbench/WorkbenchButton";
import { LeafButton } from "./components/LeafButton";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";

export default function SidebarBottom() {
	const env = useEnv();

	return (
		<div className="">
			<div className="px-2 flex flex-col gap-1 mb-2">
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
