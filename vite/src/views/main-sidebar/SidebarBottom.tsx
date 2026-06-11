"use client";

import { BooksIcon } from "@phosphor-icons/react";
import { useEnv } from "@/utils/envUtils";
import { WorkbenchButton } from "@/views/customers2/customer/workbench/WorkbenchButton";
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
				<SidebarContact />
			</div>
		</div>
	);
}
