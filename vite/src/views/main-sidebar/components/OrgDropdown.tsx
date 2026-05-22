import { useQueryClient } from "@tanstack/react-query";
import {
	ChevronDown,
	Monitor,
	Moon,
	PanelRight,
	Plus,
	Sun,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AdminHover } from "@/components/general/AdminHover";
import { Button } from "@/components/v2/buttons/Button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useTheme } from "@/contexts/ThemeProvider";
import { setLastSwitchedOrgId, useOrg } from "@/hooks/common/useOrg";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { OrgLogo } from "../org-dropdown/components/OrgLogo";
import { useMemberships } from "../org-dropdown/hooks/useMemberships";
import { useSidebarContext } from "../SidebarContext";
import { navigateTo } from "@/utils/genUtils";
import { AdminDropdownItems } from "./AdminDropdownItems";
import { CreateNewOrg } from "./CreateNewOrg";
import { LogOutItem } from "./LogOutItem";

export const OrgDropdown = () => {
	const { org, isLoading, error } = useOrg();
	const { expanded, setExpanded } = useSidebarContext();
	const { mode, setMode } = useTheme();
	const navigate = useNavigate();

	const { data: orgsData } = useListOrganizations();
	let orgs = Array.isArray(orgsData) ? orgsData : undefined;
	const { data: activeOrganization } = authClient.useActiveOrganization();

	if (activeOrganization && orgs) {
		orgs = orgs.filter((o) => o.id !== activeOrganization.id);
	}

	const [dialogType, setDialogType] = useState<"create" | "manage" | null>(
		null,
	);

	const { data: session } = useSession();

	useMemberships();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	if (isLoading)
		return (
			<div className="h-7 w-32 px-4 flex items-center gap-2">
				<Skeleton className="min-w-5 h-5" />
				<Skeleton className="w-32 h-5" />
			</div>
		);

	if (!org || error) return null;

	return (
		<div className={cn("flex", expanded ? "px-3" : "px-2")}>
			<CreateNewOrg dialogType={dialogType} setDialogType={setDialogType} />

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<AdminHover
					texts={[
						{
							key: "id",
							value: org.id,
						},
					]}
					asChild
				>
					<DropdownMenuTrigger asChild>
						<Button
							className={cn(
								"bg-transparent! gap-2 rounded-md items-center transition-all duration-200 cursor-pointer",
								expanded
									? "h-7 min-w-28 p-0.5 justify-start shimmer-hover"
									: "h-7 w-full px-2 justify-center hover:bg-transparent",
							)}
							variant="skeleton"
						>
							<OrgLogo org={org} />
							<div
								className={cn(
									"flex items-center gap-1 transition-all duration-200",
									expanded
										? "opacity-100 translate-x-0"
										: "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
								)}
							>
								<span className="text-muted-foreground max-w-24 truncate">{org?.name}</span>
								<ChevronDown size={14} className="text-tertiary-foreground" />
							</div>
						</Button>
					</DropdownMenuTrigger>
				</AdminHover>
				<DropdownMenuContent
					align="start"
					className="w-48"
				>
					<AdminDropdownItems />
					<DropdownMenuItem
						className="flex justify-between w-full items-center gap-2 text-muted-foreground cursor-pointer"
						onClick={() => {
							navigateTo("/settings", navigate);
							setDropdownOpen(false);
						}}
					>
						<div className="flex flex-col">
							<span>{session?.user?.name}</span>
							<span className="text-xs text-zinc-500 break-all hyphens-auto">
								{session?.user?.email}
							</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => setDialogType("create")}>
							<div className="flex justify-between w-full items-center gap-2 text-muted-foreground">
								<span>Create Organization</span>
								<Plus size={14} />
							</div>
						</DropdownMenuItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="text-muted-foreground">
								<div className="flex justify-between w-full items-center gap-2">
									<span>Theme</span>
									{mode === "light" && <Sun size={14} />}
									{mode === "dark" && <Moon size={14} />}
									{mode === "system" && <Monitor size={14} />}
								</div>
							</DropdownMenuSubTrigger>
							<DropdownMenuPortal>
								<DropdownMenuSubContent className="w-36">
									<DropdownMenuItem
										onClick={() => setMode("light")}
										className="flex justify-between items-center"
									>
										<span className="text-muted-foreground">Light</span>
										<Sun size={14} />
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => setMode("dark")}
										className="flex justify-between items-center"
									>
										<span className="text-muted-foreground">Dark</span>
										<Moon size={14} />
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => setMode("system")}
										className="flex justify-between items-center"
									>
										<span className="text-muted-foreground">System</span>
										<Monitor size={14} />
									</DropdownMenuItem>
								</DropdownMenuSubContent>
							</DropdownMenuPortal>
						</DropdownMenuSub>
						{!expanded && (
							<DropdownMenuItem
								onClick={() => {
									setExpanded(true);
									setDropdownOpen(false);
								}}
							>
								<div className="flex justify-between w-full items-center gap-2 text-muted-foreground">
									<span>Open Sidebar</span>
									<PanelRight size={14} />
								</div>
							</DropdownMenuItem>
						)}
						{orgs && orgs.length > 0 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuSub>
									<DropdownMenuSubTrigger className="text-muted-foreground">
										Switch Organization
									</DropdownMenuSubTrigger>
									<DropdownMenuPortal>
										<DropdownMenuSubContent className="w-64 max-h-[min(28rem,calc(100vh-4rem))] overflow-y-auto">
											{orgs.map((org) => (
												<SwitchOrgItem
													key={org.id}
													org={org}
													setDropdownOpen={setDropdownOpen}
												/>
											))}
										</DropdownMenuSubContent>
									</DropdownMenuPortal>
								</DropdownMenuSub>
							</>
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<LogOutItem />
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};

/** Switches the active org via client-side state update (no page reload). */
export const useOrgSwitch = () => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	return async ({
		orgId,
		setLoading,
	}: {
		orgId: string;
		setLoading?: (loading: boolean) => void;
	}) => {
		setLoading?.(true);
		try {
			await authClient.organization.setActive({
				organizationId: orgId,
			});

			const { data: newOrg } = await axiosInstance.get("/organization");

			if (newOrg?.id) setLastSwitchedOrgId(newOrg.id);

			queryClient.setQueryData(["org", env], newOrg);
			queryClient.invalidateQueries({ queryKey: ["org"] });

			if (
				newOrg &&
				!newOrg.deployed &&
				!window.location.pathname.includes("/sandbox")
			) {
				const pathname = window.location.pathname;
				const search = window.location.search;
				navigate(`/sandbox${pathname}${search}`);
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to switch organization",
			);
		} finally {
			setLoading?.(false);
		}
	};
};

const SwitchOrgItem = ({
	org,
	setDropdownOpen,
}: {
	org: { id: string; name: string };
	setDropdownOpen: (open: boolean) => void;
}) => {
	const [loading, setLoading] = useState(false);
	const switchOrg = useOrgSwitch();

	return (
		<DropdownMenuItem
			key={org.id}
			onClick={async (e) => {
				e.preventDefault();
				await switchOrg({ orgId: org.id, setLoading });
				setDropdownOpen(false);
			}}
			shimmer={loading}
			className="flex justify-between"
		>
			<span className={cn("text-muted-foreground")}>{org.name}</span>
		</DropdownMenuItem>
	);
};
