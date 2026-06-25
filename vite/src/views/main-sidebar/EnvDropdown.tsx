/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
"use client";

import { AppEnv } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	Skeleton,
} from "@autumn/ui";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { PhosphorIcon } from "@/components/v2/icons/PhosphorIcon";
import { useOrg } from "@/hooks/common/useOrg";
import {
	type SandboxSummary,
	useSandboxesQuery,
} from "@/hooks/queries/useSandboxesQuery";
import { sandboxColorClass } from "@/hooks/sandbox/sandboxDisplay";
import {
	type ActiveSandbox,
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { cn } from "@/lib/utils";
import { envToPath } from "@/utils/genUtils";
import { CreateSandboxDialog } from "./env-dropdown/CreateSandboxDialog";
import { DeleteSandboxDialog } from "./env-dropdown/DeleteSandboxDialog";
import { EditSandboxDialog } from "./env-dropdown/EditSandboxDialog";
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
	const activeSandbox = useActiveSandbox();
	const { sandboxes } = useSandboxesQuery({
		enabled: !isLoading && !!org?.deployed,
	});

	const [isHovered, setIsHovered] = useState(false);
	const [open, setOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [sandboxToDelete, setSandboxToDelete] = useState<SandboxSummary | null>(
		null,
	);
	const [sandboxToEdit, setSandboxToEdit] = useState<SandboxSummary | null>(
		null,
	);
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
									selectSandbox({
										id: sandbox.id,
										name: sandbox.name,
										color: sandbox.color,
										icon: sandbox.icon,
									})
								}
							>
								<span className="flex items-center gap-2 truncate">
									<PhosphorIcon
										name={sandbox.icon}
										className={cn(
											"size-3 shrink-0",
											sandboxColorClass(sandbox.color),
										)}
									/>
									<span className="truncate">{sandbox.name}</span>
								</span>
								<span className="flex shrink-0 items-center gap-1">
									{isActive && (
										<Check
											size={12}
											className="!h-4 text-tertiary-foreground"
										/>
									)}
									<button
										aria-label={`Edit ${sandbox.name}`}
										className="text-muted-foreground transition-colors hover:text-foreground"
										onClick={(e) => {
											e.stopPropagation();
											setOpen(false);
											setSandboxToEdit(sandbox);
										}}
										type="button"
									>
										<Pencil size={12} className="!h-3 w-3" />
									</button>
									<button
										aria-label={`Delete ${sandbox.name}`}
										className="text-muted-foreground transition-colors hover:text-destructive"
										onClick={(e) => {
											e.stopPropagation();
											setOpen(false);
											setSandboxToDelete(sandbox);
										}}
										type="button"
									>
										<Trash2 size={12} className="!h-3 w-3" />
									</button>
								</span>
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
			{sandboxToDelete && (
				<DeleteSandboxDialog
					sandbox={sandboxToDelete}
					open
					setOpen={(next) => {
						if (!next) {
							setSandboxToDelete(null);
						}
					}}
				/>
			)}
			{sandboxToEdit && (
				<EditSandboxDialog
					sandbox={sandboxToEdit}
					open
					setOpen={(next) => {
						if (!next) {
							setSandboxToEdit(null);
						}
					}}
				/>
			)}
		</div>
	);
};
