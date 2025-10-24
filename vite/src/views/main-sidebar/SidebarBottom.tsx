"use client";

import { CommandIcon } from "@phosphor-icons/react";
import { Book } from "lucide-react";
import { useCommandBarStore } from "@/hooks/stores/useCommandBarStore";
import { useEnv } from "@/utils/envUtils";
import { NavButton } from "./NavButton";
import { SidebarContact } from "./SidebarContact";

export default function SidebarBottom() {
	const env = useEnv();
	// const { user, isLoaded } = useUser();
	const openCommandBar = useCommandBarStore((state) => state.openCommandBar);

	return (
		<div className="">
			<div className="px-2 flex flex-col gap-1 mb-2">
				{/* <NavButton
          value="integrations/stripe"
          icon={<Blocks size={14} />}
          title="Connect to Stripe"
          env={env}
        /> */}
				<NavButton
					value="docs"
					icon={<Book size={14} />}
					title="Documentation"
					env={env}
					href="https://docs.useautumn.com"
				/>
				<SidebarContact />
			</div>
		</div>
	);
}

{
	/* <div
  className={cn(
    "flex items-center gap-2 mb-4 mt-6 px-4",
    state != "expanded" && "w-full flex px-0 justify-center",
  )}
>
  <div className="relative w-7 h-7">
    <UserButton />
  </div>
  {expanded && (
    <div className="text-xs flex flex-col gap-1 overflow-hidden">
      <p className="text-t2">{user?.name}</p>
      <p
        className="text-t3 overflow-hidden text-ellipsis 
            whitespace-nowrap"
      >
        {user?.email}
      </p>
    </div>
  )}
</div>; */
}
