"use client";

import { AppEnv } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	Skeleton,
} from "@autumn/ui";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import {
	type SandboxSummary,
	useSandboxesQuery,
} from "@/hooks/queries/useSandboxesQuery";
import { sandboxBasePath } from "@/hooks/sandbox/sandboxUrl";
import {
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { cn } from "@/lib/utils";
import { envToPath } from "@/utils/genUtils";
import { CreateSandboxDialog } from "./env-dropdown/CreateSandboxDialog";
import { EnvironmentIcon } from "./env-dropdown/EnvironmentIcon";
import { EnvironmentMenuItem } from "./env-dropdown/EnvironmentMenuItem";
import { EnvironmentMenuSearch } from "./env-dropdown/EnvironmentMenuSearch";
import { ExpandedEnvTrigger } from "./env-dropdown/ExpandedEnvTrigger";
import { ManageEnvironmentsDialog } from "./env-dropdown/manage-environments/ManageEnvironmentsDialog";
import { useSidebarContext } from "./SidebarContext";

const SEARCHABLE_ENVIRONMENT_COUNT = 6;

const matchesQuery = ({ name, query }: { name: string; query: string }) =>
	name.toLowerCase().includes(query.trim().toLowerCase());

export const useEnvChange = () => {
	const navigate = useNavigate();

	const handleEnvChange = (targetEnv: AppEnv, reset?: boolean) => {
		if (reset) {
			navigate(
				targetEnv === AppEnv.Sandbox
					? `${sandboxBasePath()}/products`
					: "/products",
			);
			return;
		}
		const newPath = envToPath(targetEnv, location.pathname);
		const params = new URLSearchParams(location.search);
		const tab = params.get("tab");
		navigate(tab ? `${newPath}?tab=${encodeURIComponent(tab)}` : newPath);
	};

	return handleEnvChange;
};

export const EnvDropdown = ({ env }: { env: AppEnv }) => {
	const { org, isLoading } = useOrg();
	const activeSandbox = useActiveSandbox();
	const { sandboxes } = useSandboxesQuery({
		enabled: !isLoading && !!org,
	});

	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [manageOpen, setManageOpen] = useState(false);
	const handleEnvChange = useEnvChange();
	const { expanded } = useSidebarContext();

	const isResolving = isLoading || !org;
	const willRedirectToSandbox = !!org && !org.deployed && env === AppEnv.Live;

	if (isResolving || willRedirectToSandbox) {
		return (
			<div className="flex gap-1 px-3 text-xs text-muted-foreground">
				<Skeleton className={cn("h-7", expanded ? "w-full" : "w-7")} />
			</div>
		);
	}

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			setQuery("");
		}
	};

	const selectMainEnv = (target: AppEnv) => {
		setActiveSandbox(null);
		handleEnvChange(target);
	};

	const selectSandbox = (sandbox: SandboxSummary) => {
		setActiveSandbox({
			id: sandbox.id,
			name: sandbox.name,
			color: sandbox.color,
			icon: sandbox.icon,
		});
		handleEnvChange(AppEnv.Sandbox);
	};

	const isDeployed = !!org?.deployed;
	const inLegacySandbox = env === AppEnv.Sandbox && !activeSandbox;
	const environmentCount = sandboxes.length + (isDeployed ? 2 : 1);
	const isSearchable = environmentCount >= SEARCHABLE_ENVIRONMENT_COUNT;

	const showProduction =
		isDeployed && matchesQuery({ name: "Production", query });
	const showLegacySandbox = matchesQuery({ name: "Sandbox", query });
	const visibleSandboxes = sandboxes.filter((sandbox) =>
		matchesQuery({ name: sandbox.name, query }),
	);
	const hasSandboxResults = showLegacySandbox || visibleSandboxes.length > 0;

	return (
		<div className="flex gap-1 px-3 text-xs text-muted-foreground">
			<DropdownMenu open={open} onOpenChange={handleOpenChange}>
				<ExpandedEnvTrigger />

				<DropdownMenuContent
					side="bottom"
					align="start"
					className={expanded ? "w-(--anchor-width)" : "w-52"}
				>
					{isSearchable && (
						<EnvironmentMenuSearch query={query} onQueryChange={setQuery} />
					)}

					{showProduction && (
						<DropdownMenuGroup>
							<DropdownMenuLabel className="px-2 text-tertiary-foreground">
								Live
							</DropdownMenuLabel>
							<EnvironmentMenuItem
								icon={<EnvironmentIcon isLive className="size-3.5" />}
								name="Production"
								isActive={env === AppEnv.Live}
								onSelect={() => selectMainEnv(AppEnv.Live)}
							/>
						</DropdownMenuGroup>
					)}

					{hasSandboxResults && (
						<DropdownMenuGroup>
							<DropdownMenuLabel className="px-2 text-tertiary-foreground">
								Sandboxes
							</DropdownMenuLabel>
							{showLegacySandbox && (
								<EnvironmentMenuItem
									icon={<EnvironmentIcon className="size-3.5" />}
									name="Sandbox"
									hint="Default"
									isActive={inLegacySandbox}
									onSelect={() => selectMainEnv(AppEnv.Sandbox)}
								/>
							)}
							{visibleSandboxes.map((sandbox) => (
								<EnvironmentMenuItem
									key={sandbox.id}
									icon={
										<EnvironmentIcon sandbox={sandbox} className="size-3.5" />
									}
									name={sandbox.name}
									isActive={
										env === AppEnv.Sandbox && activeSandbox?.id === sandbox.id
									}
									onSelect={() => selectSandbox(sandbox)}
								/>
							))}
						</DropdownMenuGroup>
					)}

					{!showProduction && !hasSandboxResults && (
						<p className="px-2 py-1.5 text-sm text-tertiary-foreground">
							No environments found
						</p>
					)}

					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="h-7 gap-2 px-2"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="size-3.5" />
						New sandbox
					</DropdownMenuItem>
					<DropdownMenuItem
						className="h-7 gap-2 px-2"
						onClick={() => setManageOpen(true)}
					>
						<SlidersHorizontal className="size-3.5" />
						Manage sandboxes
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<CreateSandboxDialog open={createOpen} onOpenChange={setCreateOpen} />
			<ManageEnvironmentsDialog
				open={manageOpen}
				onOpenChange={setManageOpen}
				sandboxes={sandboxes}
				isDeployed={isDeployed}
				onCreateSandbox={() => {
					setManageOpen(false);
					setCreateOpen(true);
				}}
			/>
		</div>
	);
};
