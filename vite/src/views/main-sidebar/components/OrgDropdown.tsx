import {
	Button,
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
	GroupedTabButton,
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
import { type ReactElement, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AdminHover } from "@/components/general/AdminHover";
import { useTheme } from "@/contexts/ThemeProvider";
import { useOrg, useSwitchActiveOrg } from "@/hooks/common/useOrg";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { OrgAvatar } from "../org-dropdown/components/OrgAvatar";
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
} from "./orgMenuClass";

type ThemeMode = ReturnType<typeof useTheme>["mode"];

const THEME_ICON_STROKE = 1.75;

const THEME_OPTIONS = [
	{
		value: "system",
		ariaLabel: "System theme",
		icon: <Monitor className="size-[13px]" strokeWidth={THEME_ICON_STROKE} />,
	},
	{
		value: "light",
		ariaLabel: "Light theme",
		icon: <Sun className="size-[13px]" strokeWidth={THEME_ICON_STROKE} />,
	},
	{
		value: "dark",
		ariaLabel: "Dark theme",
		icon: <Moon className="size-[13px]" strokeWidth={THEME_ICON_STROKE} />,
	},
] satisfies Array<{ value: ThemeMode; ariaLabel: string; icon: ReactElement }>;

const isThemeMode = (value: string): value is ThemeMode =>
	THEME_OPTIONS.some((option) => option.value === value);

export const OrgDropdown = () => {
	const { org, isLoading, error } = useOrg();
	const { expanded, setExpanded } = useSidebarContext();
	const { mode, setMode } = useTheme();
	const { data: session } = useSession();

	const { data: orgsData } = useListOrganizations();
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const activeOrgId = activeOrganization?.id;
	const orgs = [...(Array.isArray(orgsData) ? orgsData : [])].sort(
		(a, b) => Number(b.id === activeOrgId) - Number(a.id === activeOrgId),
	);
	const canSwitchOrg = orgs.some((listedOrg) => listedOrg.id !== activeOrgId);

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
				{expanded && <Skeleton className="h-4 w-20" />}
			</div>
		);

	if (!org || error) return null;

	return (
		<div className={cn("flex min-w-0", !expanded && "w-full justify-center")}>
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
					triggerClassName="min-w-0 max-w-full"
				>
					<DropdownMenuTrigger asChild>
						<Button
							className={cn(
								"bg-transparent! border-0! h-8! min-w-0 max-w-full shrink! cursor-pointer items-center rounded-[5px]",
								expanded
									? "shimmer-hover justify-start gap-2 pl-1.5! pr-[7px]! data-[popup-open]:bg-black/[0.05]! dark:data-[popup-open]:bg-white/[0.06]!"
									: "justify-center gap-0 px-0! hover:bg-transparent",
							)}
							variant="skeleton"
						>
							<OrgLogo org={org} />
							<span
								className={cn(
									"min-w-0 truncate text-[13px] font-[550] leading-4 tracking-[-0.005em] text-foreground dark:text-[#EDEDED]",
									!expanded && "hidden",
								)}
							>
								{org.name}
							</span>
							{expanded && (
								<ChevronsUpDown
									className="size-[11px] shrink-0 text-[#8A8A8A] dark:text-[#5C5C5C]"
									strokeWidth={2.5}
								/>
							)}
						</Button>
					</DropdownMenuTrigger>
				</AdminHover>
				<DropdownMenuContent
					align="start"
					sideOffset={4}
					className="w-58 rounded-md"
				>
					<DropdownMenuGroup>
						{canSwitchOrg && (
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className={ORG_MENU_ITEM_CLASS}>
									<ChevronsUpDown
										className={ORG_MENU_ICON_CLASS}
										strokeWidth={ORG_MENU_ICON_STROKE}
									/>
									<span className="min-w-0 flex-1 truncate">
										Switch organization
									</span>
								</DropdownMenuSubTrigger>
								<DropdownMenuPortal>
									<DropdownMenuSubContent className="w-55 rounded-md max-h-[min(28rem,calc(100vh-4rem))] overflow-y-auto">
										{orgs.map((listedOrg) => (
											<SwitchOrgItem
												key={listedOrg.id}
												org={listedOrg}
												isActive={listedOrg.id === activeOrgId}
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
					<div className="flex h-8 items-center gap-2 pr-1 pl-2">
						<span className="flex-1 text-[13px] font-[450] text-muted-foreground">
							Theme
						</span>
						<GroupedTabButton
							value={mode}
							onValueChange={(value) => {
								if (isThemeMode(value)) setMode(value);
							}}
							options={THEME_OPTIONS}
							className="shrink-0"
							buttonClassName="h-[22px] w-[26px] px-0"
						/>
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
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
					{session?.user.email && (
						<>
							<DropdownMenuSeparator />
							<p className="truncate px-2 py-1 text-[11.5px] leading-4 text-tertiary-foreground dark:text-[#5C5C5C]">
								{session.user.email}
							</p>
						</>
					)}
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
	isActive,
	setDropdownOpen,
}: {
	org: { id: string; name: string; logo?: string | null };
	isActive: boolean;
	setDropdownOpen: (open: boolean) => void;
}) => {
	const [loading, setLoading] = useState(false);
	const switchOrg = useOrgSwitch();

	return (
		<DropdownMenuItem
			onClick={async (e) => {
				e.preventDefault();
				if (isActive) {
					setDropdownOpen(false);
					return;
				}
				await switchOrg({ orgId: org.id, setLoading });
				setDropdownOpen(false);
			}}
			shimmer={loading}
			className={cn(ORG_MENU_ITEM_CLASS, isActive && "text-foreground")}
		>
			<OrgAvatar name={org.name} logo={org.logo} />
			<span className="min-w-0 flex-1 truncate">{org.name}</span>
			{isActive && (
				<Check
					className="size-3 shrink-0 text-muted-foreground"
					strokeWidth={2.5}
				/>
			)}
		</DropdownMenuItem>
	);
};
