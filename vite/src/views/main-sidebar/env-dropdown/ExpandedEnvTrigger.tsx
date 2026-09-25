import { AppEnv } from "@autumn/shared";
import { DropdownMenuTrigger } from "@autumn/ui";
import { ChevronsUpDown } from "lucide-react";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { useSidebarContext } from "../SidebarContext";
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
			className="flex w-full cursor-pointer select-none items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div
				className={cn(
					"flex h-7 w-full items-center gap-2 overflow-hidden rounded-md border bg-interactive-secondary text-foreground transition-colors duration-150 ease-out hover:bg-interactive-secondary-hover",
					expanded ? "justify-between px-2" : "w-7 justify-center px-0",
				)}
			>
				<span className="flex min-w-0 items-center gap-2">
					<EnvironmentIcon
						isLive={isLive}
						sandbox={isLive ? null : activeSandbox}
						className="size-3.5"
					/>
					{expanded && (
						<span className="truncate text-sm font-medium">{label}</span>
					)}
				</span>
				{expanded && (
					<ChevronsUpDown className="size-3.5 shrink-0 text-tertiary-foreground" />
				)}
			</div>
		</DropdownMenuTrigger>
	);
};
