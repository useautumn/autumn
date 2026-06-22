/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
"use client";

import { AppEnv } from "@autumn/shared";
import { Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/v2/dropdowns/DropdownMenu";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { envToPath } from "@/utils/genUtils";
import { ExpandedEnvTrigger } from "./env-dropdown/ExpandedEnvTrigger";
import { StaticEnvPill } from "./env-dropdown/StaticEnvPill";
import { useSidebarContext } from "./SidebarContext";

export const useEnvChange = () => {
	const navigate = useNavigate();

	const handleEnvChange = (targetEnv: AppEnv, reset?: boolean) => {
		const newPath = envToPath(targetEnv, location.pathname);

		if (newPath && !reset) {
			const params = new URLSearchParams(location.search);
			const tab = params.get("tab");
			const url = tab ? `${newPath}?tab=${encodeURIComponent(tab)}` : newPath;
			navigate(url);
		} else {
			navigate(
				targetEnv === AppEnv.Sandbox ? "/sandbox/products" : "/products",
			);
		}
	};

	return handleEnvChange;
};

export const EnvDropdown = ({ env }: { env: AppEnv }) => {
	const { org, isLoading } = useOrg();

	const [isHovered, setIsHovered] = useState(false);
	const [open, setOpen] = useState(false);
	const handleEnvChange = useEnvChange();
	const { expanded } = useSidebarContext();

	const isResolving = isLoading || !org;
	const willRedirectToSandbox = !!org && !org.deployed && env === AppEnv.Live;

	if (isResolving || willRedirectToSandbox) {
		return (
			<div className={cn("flex text-muted-foreground text-xs gap-1 px-3")}>
				<Skeleton className={cn("h-6", expanded ? "w-full" : "w-7")} />
			</div>
		);
	}

	const canSwitch = !!org?.deployed;
	if (!canSwitch) {
		return (
			<div className={cn("flex text-muted-foreground text-xs gap-1 px-3")}>
				<StaticEnvPill />
			</div>
		);
	}

	return (
		<div
			className={cn("flex text-muted-foreground text-xs gap-1 px-3")}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<ExpandedEnvTrigger isHovered={isHovered} />

				<DropdownMenuContent side="bottom" align="start" className="w-[180px]">
					<DropdownMenuItem
						className="flex justify-between items-center text-muted-foreground"
						onClick={() => {
							handleEnvChange(AppEnv.Sandbox);
						}}
					>
						<span>Sandbox</span>
						{env === AppEnv.Sandbox && (
							<Check size={12} className="!h-4 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>

					<DropdownMenuItem
						className="flex justify-between items-center text-muted-foreground"
						onClick={() => {
							handleEnvChange(AppEnv.Live);
						}}
					>
						<span>Production</span>
						{env === AppEnv.Live && (
							<Check size={12} className="!h-4 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
