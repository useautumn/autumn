import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	Skeleton,
} from "@autumn/ui";
import {
	Check,
	ChevronsUpDown,
	Monitor,
	Moon,
	PanelLeft,
	Plus,
	Sun,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AdminHover } from "@/components/general/AdminHover";
import { useTheme } from "@/contexts/ThemeProvider";
import { useOrg, useSwitchActiveOrg } from "@/hooks/common/useOrg";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { OrgLogo } from "../org-dropdown/components/OrgLogo";
import { useMemberships } from "../org-dropdown/hooks/useMemberships";
import { useSidebarContext } from "../SidebarContext";
import { AdminMenuItems } from "./AdminMenuItems";
import { CreateNewOrg } from "./CreateNewOrg";
import { LogOutItem } from "./LogOutItem";
import {
	ORG_MENU_ICON_CLASS,
	ORG_MENU_ICON_STROKE,
	ORG_MENU_ITEM_CLASS,
	ORG_MENU_LABEL_CLASS,
} from "./orgMenuClass";

const THEME_MODES = ["light", "dark", "system"] as const;

const THEME_MODE_LABELS: Record<(typeof THEME_MODES)[number], string> = {
	light: "Light",
	dark: "Dark",
	system: "System",
};

const THEME_MODE_ICONS = { light: Sun, dark: Moon, system: Monitor };

const ThemeModeIcon = ({ mode }: { mode: (typeof THEME_MODES)[number] }) => {
	const Icon = THEME_MODE_ICONS[mode];
	return (
		<Icon className={ORG_MENU_ICON_CLASS} strokeWidth={ORG_MENU_ICON_STROKE} />
	);
};

export const OrgDropdown = () => {
	const { org, isLoading, error } = useOrg();
	const { expanded, setExpanded } = useSidebarContext();
	const { mode, setMode } = useTheme();

	const { data: orgsData } = useListOrganizations();
	let orgs = Array.isArray(orgsData) ? orgsData : undefined;
	const { data: activeOrganization } = authClient.useActiveOrganization();

	if (activeOrganization && orgs) {
		orgs = orgs.filter((o) => o.id !== activeOrganization.id);
	}

	const [dialogType, setDialogType] = useState<"create" | "manage" | null>(
		null,
	);

	useMemberships();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	if (isLoading)
		return (
			<div
				className={cn(
					"flex h-8 items-center gap-2",
					expanded ? "px-1.5" : "justify-center",
				)}
			>
				<Skeleton className="size-5 shrink-0 rounded-md" />
				{expanded && <Skeleton className="h-4 w-28" />}
			</div>
		);

	if (!org || error) return null;

	return (
		// px-2 in both states so the logo keeps the nav rows' inset instead of
		// stepping inwards when the sidebar expands.
		<div className={cn("flex", !expanded && "justify-center")}>
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
					triggerClassName="w-full"
				>
					<DropdownMenuTrigger asChild>
						<Button
							className={cn(
								"bg-transparent! border-0! h-8! w-full cursor-pointer items-center rounded-md",
								expanded
									? "shimmer-hover justify-start gap-2 px-1.5! data-[popup-open]:bg-black/[0.04]! dark:data-[popup-open]:bg-white/[0.04]!"
									: "justify-center gap-0 px-0! hover:bg-transparent",
							)}
							variant="skeleton"
						>
							<OrgLogo org={org} />
							<div
								className={cn("flex items-center gap-2", !expanded && "hidden")}
							>
								<span className="max-w-28 truncate text-[13px] font-[550] leading-4 tracking-[-0.005em] text-foreground dark:text-[#EDEDED]">
									{org?.name}
								</span>
								<ChevronsUpDown
									className="size-3.5 text-[#8A8A8A] dark:text-[#6B6B6B]"
									strokeWidth={1.75}
								/>
							</div>
						</Button>
					</DropdownMenuTrigger>
				</AdminHover>
				<DropdownMenuContent
					align="start"
					className={expanded ? "w-(--anchor-width)" : "w-60"}
				>
					<DropdownMenuGroup>
						<DropdownMenuLabel className={ORG_MENU_LABEL_CLASS}>
							Organization
						</DropdownMenuLabel>
						{orgs && orgs.length > 0 && (
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className={ORG_MENU_ITEM_CLASS}>
									<ChevronsUpDown
										className={ORG_MENU_ICON_CLASS}
										strokeWidth={ORG_MENU_ICON_STROKE}
									/>
									<span className="min-w-0 flex-1 truncate">{org.name}</span>
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
						)}
						<DropdownMenuItem
							className={ORG_MENU_ITEM_CLASS}
							onClick={() => setDialogType("create")}
						>
							<Plus
								className={ORG_MENU_ICON_CLASS}
								strokeWidth={ORG_MENU_ICON_STROKE}
							/>
							Create organization
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel className={ORG_MENU_LABEL_CLASS}>
							Account
						</DropdownMenuLabel>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className={ORG_MENU_ITEM_CLASS}>
								<ThemeModeIcon mode={mode} />
								<span className="flex-1">Theme</span>
								<span className="text-xs text-tertiary-foreground">
									{THEME_MODE_LABELS[mode]}
								</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuPortal>
								<DropdownMenuSubContent className="w-36">
									{THEME_MODES.map((themeMode) => (
										<DropdownMenuItem
											key={themeMode}
											className={ORG_MENU_ITEM_CLASS}
											onClick={() => setMode(themeMode)}
										>
											<ThemeModeIcon mode={themeMode} />
											<span className="flex-1">
												{THEME_MODE_LABELS[themeMode]}
											</span>
											{mode === themeMode && (
												<Check className="size-3.5 text-foreground" />
											)}
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuPortal>
						</DropdownMenuSub>
						<AdminMenuItems />
						{!expanded && (
							<DropdownMenuItem
								className={ORG_MENU_ITEM_CLASS}
								onClick={() => {
									setExpanded(true);
									setDropdownOpen(false);
								}}
							>
								<PanelLeft
									className={ORG_MENU_ICON_CLASS}
									strokeWidth={ORG_MENU_ICON_STROKE}
								/>
								Open sidebar
							</DropdownMenuItem>
						)}
						<LogOutItem />
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};

/** Switches the active org via client-side state update (no page reload). */
export const useOrgSwitch = () => {
	const navigate = useNavigate();
	const switchActiveOrg = useSwitchActiveOrg();

	return async ({
		orgId,
		setLoading,
	}: {
		orgId: string;
		setLoading?: (loading: boolean) => void;
	}) => {
		setLoading?.(true);
		try {
			await switchActiveOrg(orgId);
			navigate("/");
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
			className={ORG_MENU_ITEM_CLASS}
		>
			<span className="truncate">{org.name}</span>
		</DropdownMenuItem>
	);
};
