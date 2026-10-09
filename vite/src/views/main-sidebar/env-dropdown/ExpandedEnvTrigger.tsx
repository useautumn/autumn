import { AppEnv } from "@autumn/shared";
import { DropdownMenuTrigger } from "@autumn/ui";
import { ChevronsUpDown } from "lucide-react";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { useSidebarContext } from "../SidebarContext";
import {
	sidebarIconClass,
	sidebarRowClass,
	sidebarRowContentClass,
} from "../sidebarRowClass";
import { EnvironmentIcon } from "./EnvironmentIcon";

export const ExpandedEnvTrigger = () => {
	const env = useEnv();
	const activeSandbox = useActiveSandbox();
	const { expanded } = useSidebarContext();

	const isLive = env === AppEnv.Live;
	const label = isLive ? "Production" : (activeSandbox?.name ?? "Sandbox");

	return (
		<DropdownMenuTrigger
			aria-label={`Environment: ${label}`}
			className={cn(sidebarRowClass({ isCollapsed: !expanded }), "select-none")}
		>
			<span className={sidebarRowContentClass({ isCollapsed: !expanded })}>
				<span className={sidebarIconClass()}>
					<EnvironmentIcon
						isLive={isLive}
						sandbox={isLive ? null : activeSandbox}
					/>
				</span>
				{expanded && <span className="truncate">{label}</span>}
			</span>
			{expanded && (
				<ChevronsUpDown
					className="size-3.5 shrink-0 text-[#8A8A8A] dark:text-[#6B6B6B]"
					strokeWidth={1.75}
				/>
			)}
		</DropdownMenuTrigger>
	);
};
