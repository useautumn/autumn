import { Scopes } from "@autumn/shared";
import { Button } from "@autumn/ui";
import {
	ChartColumn,
	Gift,
	KeyRound,
	Layers,
	Package,
	PanelLeft,
	Users,
	Webhook,
	Workflow,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useScopes } from "@/hooks/useScopes";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { OrgDropdown } from "./components/OrgDropdown";
import { EnvDropdown } from "./EnvDropdown";
import { NavButton } from "./NavButton";
import { NavSection } from "./NavSection";
import SidebarBottom from "./SidebarBottom";
import { SidebarContext } from "./SidebarContext";
import { SidebarRail } from "./SidebarRail";
import { SidebarSearchButton } from "./SidebarSearchButton";
import { SIDEBAR_ICON_STROKE as ICON_STROKE } from "./sidebarRowClass";

/** Exported so the command bar can offer the same tabs without a second list. */
export const DEV_SUB_TABS = [
	{
		title: "API keys",
		value: "api_keys",
		icon: <KeyRound strokeWidth={ICON_STROKE} />,
	},
	{
		title: "Webhooks",
		value: "webhooks",
		icon: <Webhook strokeWidth={ICON_STROKE} />,
	},
];

export const MainSidebar = ({
	onNavigate,
}: {
	onNavigate?: () => void;
} = {}) => {
	const env = useEnv();

	const { has } = useScopes();
	const canSeeDev = has(Scopes.ApiKeys.Read);

	const [storedExpanded, setExpanded] = useLocalStorage<boolean>(
		"sidebar.expanded",
		true,
	);

	// In mobile sheet mode, always show expanded sidebar
	const isMobileSheet = !!onNavigate;
	const expanded = isMobileSheet ? true : storedExpanded;

	useHotkeys(["meta+b", "ctrl+b"], () => {
		setExpanded((prev) => !prev);
	});

	return (
		<SidebarContext.Provider value={{ expanded, setExpanded, onNavigate }}>
			<div
				data-slot="main-sidebar"
				className={cn(
					// Scrolls internally so a zoomed-in or crowded sidebar can't push
					// its own content out of view.
					`relative flex h-full flex-col justify-between overflow-x-hidden overflow-y-auto px-2.5 py-3.5 transition-all duration-150`,
					isMobileSheet
						? "min-w-[200px]"
						: expanded
							? "min-w-[200px] max-w-[200px]"
							: "min-w-[52px] max-w-[52px]",
				)}
			>
				<div className="relative flex flex-col gap-3.5">
					{!isMobileSheet && (
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								setExpanded((prev) => !prev);
							}}
							className={cn(
								"absolute top-2 right-1.5 z-10 size-4 border-0 border-none p-0 text-[#8A8A8A] shadow-none !bg-transparent hover:text-foreground dark:text-[#6B6B6B] dark:hover:text-[#A1A1A1]",
								expanded
									? "opacity-100 transition-opacity duration-100"
									: "opacity-0 transition-opacity duration-100",
							)}
						>
							<PanelLeft className="size-4" strokeWidth={ICON_STROKE} />
						</Button>
					)}
					<OrgDropdown />
					<EnvDropdown env={env} />
					<nav className="flex flex-col gap-[18px]">
						<SidebarSearchButton />
						<NavSection title="Catalog">
							<NavButton
								value="products"
								subValue="products"
								isDefaultSubValue
								icon={<Package strokeWidth={ICON_STROKE} />}
								title="Plans"
								env={env}
							/>
							<NavButton
								value="products"
								subValue="features"
								icon={<Layers strokeWidth={ICON_STROKE} />}
								title="Features"
								env={env}
							/>
							<NavButton
								value="products"
								subValue="rewards"
								icon={<Gift strokeWidth={ICON_STROKE} />}
								title="Rewards"
								env={env}
							/>
						</NavSection>
						<NavSection title="Customers">
							<NavButton
								value="customers"
								icon={<Users strokeWidth={ICON_STROKE} />}
								title="Customers"
								env={env}
							/>
							<NavButton
								value="migrations"
								icon={<Workflow strokeWidth={ICON_STROKE} />}
								title="Migrations"
								badge={
									<span className="ml-auto text-[10px] font-medium leading-3 tracking-[0.04em] text-[#8A8A8A] dark:text-[#7A7A7A]">
										BETA
									</span>
								}
								env={env}
							/>
							<NavButton
								value="analytics"
								icon={<ChartColumn strokeWidth={ICON_STROKE} />}
								title="Analytics"
								env={env}
							/>
						</NavSection>
						{canSeeDev && (
							<NavSection title="Developer">
								{DEV_SUB_TABS.map((devTab) => (
									<NavButton
										key={devTab.value}
										value="dev"
										subValue={devTab.value}
										isDefaultSubValue={devTab.value === "api_keys"}
										icon={devTab.icon}
										title={devTab.title}
										env={env}
									/>
								))}
							</NavSection>
						)}
					</nav>
				</div>

				<SidebarBottom />
				{!isMobileSheet && <SidebarRail />}
			</div>
		</SidebarContext.Provider>
	);
};
