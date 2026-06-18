/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
"use client";

import { AppEnv } from "@autumn/shared";
import { Check, FlaskConical, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useOrg } from "@/hooks/common/useOrg";
import { useSandboxesQuery } from "@/hooks/queries/useSandboxesQuery";
import {
	type ActiveSandbox,
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { cn } from "@/lib/utils";
import { envToPath } from "@/utils/genUtils";
import { CreateSandboxDialog } from "./env-dropdown/CreateSandboxDialog";
import { ExpandedEnvTrigger } from "./env-dropdown/ExpandedEnvTrigger";
import { StaticEnvPill } from "./env-dropdown/StaticEnvPill";

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
	const canSwitch = !isLoading && !!org?.deployed;
	const activeSandbox = useActiveSandbox();
	const { sandboxes } = useSandboxesQuery({ enabled: canSwitch });

	const [isHovered, setIsHovered] = useState(false);
	const [open, setOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const handleEnvChange = useEnvChange();

	if (!canSwitch) {
		return (
			<div className={cn("flex text-muted-foreground text-xs gap-1 px-3")}>
				<StaticEnvPill />
			</div>
		);
	}

	const selectMainEnv = (target: AppEnv) => {
		setActiveSandbox(null);
		handleEnvChange(target);
	};

	const selectSandbox = (sandbox: ActiveSandbox) => {
		setActiveSandbox(sandbox);
		handleEnvChange(AppEnv.Sandbox);
	};

	const itemClass =
		"flex justify-between items-center text-muted-foreground gap-2";
	const inLegacySandbox = env === AppEnv.Sandbox && !activeSandbox;

	return (
		<div
			className={cn("flex text-muted-foreground text-xs gap-1 px-3")}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<ExpandedEnvTrigger isHovered={isHovered} />

				<DropdownMenuContent side="bottom" align="start" className="w-[200px]">
					<DropdownMenuItem
						className={itemClass}
						onClick={() => selectMainEnv(AppEnv.Sandbox)}
					>
						<span>Sandbox</span>
						{inLegacySandbox && (
							<Check size={12} className="!h-4 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>

					<DropdownMenuItem
						className={itemClass}
						onClick={() => selectMainEnv(AppEnv.Live)}
					>
						<span>Production</span>
						{env === AppEnv.Live && (
							<Check size={12} className="!h-4 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>

					{sandboxes.length > 0 && <DropdownMenuSeparator />}

					{sandboxes.map((sandbox) => {
						const isActive =
							env === AppEnv.Sandbox && activeSandbox?.id === sandbox.id;
						return (
							<DropdownMenuItem
								key={sandbox.id}
								className={itemClass}
								onClick={() =>
									selectSandbox({ id: sandbox.id, name: sandbox.name })
								}
							>
								<span className="flex items-center gap-2 truncate">
									<FlaskConical size={12} className="!h-3 w-3 shrink-0" />
									<span className="truncate">{sandbox.name}</span>
								</span>
								{isActive && (
									<Check size={12} className="!h-4 text-tertiary-foreground" />
								)}
							</DropdownMenuItem>
						);
					})}

					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex items-center gap-2 text-muted-foreground"
						onClick={() => {
							setOpen(false);
							setCreateOpen(true);
						}}
					>
						<Plus size={12} className="!h-3 w-3 shrink-0" />
						<span>New sandbox</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<CreateSandboxDialog open={createOpen} onOpenChange={setCreateOpen} />
		</div>
	);
};
