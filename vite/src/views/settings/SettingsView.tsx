import { Scopes } from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import {
	ArrowRightLeftIcon,
	AtomIcon,
	BellIcon,
	BotIcon,
	BuildingIcon,
	CreditCardIcon,
	KeyRoundIcon,
	MousePointerClickIcon,
	PaletteIcon,
	ReceiptIcon,
	ShieldCheckIcon,
	SlidersHorizontalIcon,
	TriangleIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "react-router";
import { LabelTag } from "@/components/general/LabelTag";
import { RevenueCatIcon, StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useScopes } from "@/hooks/useScopes";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { cn } from "@/lib/utils";
import LoadingScreen from "@/views/general/LoadingScreen";
import { sidebarRowClass } from "@/views/main-sidebar/sidebarRowClass";
import { SettingsGroupContext } from "./SettingsSection";

/** Sections load with the settings page, not the app: some pull in charts and integration SDKs. */
const lazySection = <K extends string>(
	load: () => Promise<Record<K, React.ComponentType>>,
	name: K,
) =>
	lazyWithPreload(() => load().then((module) => ({ default: module[name] })));

const AccountSection = lazySection(
	() => import("./sections/AccountSection"),
	"AccountSection",
);
const AgentSection = lazySection(
	() => import("./sections/AgentSection"),
	"AgentSection",
);
const AppearanceSection = lazySection(
	() => import("./sections/AppearanceSection"),
	"AppearanceSection",
);
const AtomSection = lazySection(
	() => import("./sections/AtomSection"),
	"AtomSection",
);
const AtomSectionSkeleton = lazySection(
	() => import("./sections/AtomSection"),
	"AtomSectionSkeleton",
);
const AuthorizedAppsSection = lazySection(
	() => import("./sections/AuthorizedAppsSection"),
	"AuthorizedAppsSection",
);
const BillingSettingsSection = lazySection(
	() => import("./sections/BillingSettingsSection"),
	"BillingSettingsSection",
);
const CustomButtonsSection = lazySection(
	() => import("./sections/CustomButtonsSection"),
	"CustomButtonsSection",
);
const InvoicesSection = lazySection(
	() => import("./sections/InvoicesSection"),
	"InvoicesSection",
);
const MembersSection = lazySection(
	() => import("./sections/MembersSection"),
	"MembersSection",
);
const OrganizationSection = lazySection(
	() => import("./sections/OrganizationSection"),
	"OrganizationSection",
);
const RevenueCatSection = lazySection(
	() => import("./sections/RevenueCatSection"),
	"RevenueCatSection",
);
const SsoSection = lazySection(
	() => import("./sections/SsoSection"),
	"SsoSection",
);
const StripeSection = lazySection(
	() => import("./sections/StripeSection"),
	"StripeSection",
);
const SubscriptionSection = lazySection(
	() => import("./sections/SubscriptionSection"),
	"SubscriptionSection",
);
const TransitionRulesSection = lazySection(
	() => import("./sections/TransitionRulesSection"),
	"TransitionRulesSection",
);
const UsageAlertsSection = lazySection(
	() => import("./sections/UsageAlertsSection"),
	"UsageAlertsSection",
);
const VercelSection = lazySection(
	() => import("./sections/VercelSection"),
	"VercelSection",
);

export type SettingsTab =
	| "account"
	| "organization"
	| "subscription"
	| "members"
	| "agent"
	| "appearance"
	| "apps"
	| "sso"
	| "custom-buttons"
	| "billing"
	| "invoices"
	| "usage-alerts"
	| "transition-rules"
	| "stripe"
	| "vercel"
	| "revenuecat"
	| "atom";

export interface SettingsNavItem {
	readonly id: SettingsTab;
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly badge?: string;
}

interface SettingsNavGroup {
	readonly label: string;
	readonly items: readonly SettingsNavItem[];
}

/** Also drives the command bar, so a new tab is searchable without being
 * registered in a second place. */
export const SETTINGS_GROUPS: readonly SettingsNavGroup[] = [
	{
		label: "Organization",
		items: [
			{
				id: "account",
				label: "Account",
				icon: <UserIcon className="size-4" />,
			},
			{
				id: "organization",
				label: "Organization",
				icon: <BuildingIcon className="size-4" />,
			},
			{
				id: "subscription",
				label: "Subscription",
				icon: <CreditCardIcon className="size-4" />,
			},
			{
				id: "members",
				label: "Members",
				icon: <UsersIcon className="size-4" />,
			},
			{
				id: "appearance",
				label: "Appearance",
				icon: <PaletteIcon className="size-4" />,
			},
			{
				id: "apps",
				label: "Authorized Apps",
				icon: <ShieldCheckIcon className="size-4" />,
			},
			{
				id: "sso",
				label: "Single Sign-On",
				icon: <KeyRoundIcon className="size-4" />,
			},
			{
				id: "custom-buttons",
				label: "Custom Buttons",
				icon: <MousePointerClickIcon className="size-4" />,
			},
			{
				id: "agent",
				label: "Agent",
				icon: <BotIcon className="size-4" />,
			},
		],
	},
	{
		label: "Billing",
		items: [
			{
				id: "billing",
				label: "Configuration",
				icon: <SlidersHorizontalIcon className="size-4" />,
			},
			{
				id: "invoices",
				label: "Invoices",
				icon: <ReceiptIcon className="size-4" />,
			},
			{
				id: "usage-alerts",
				label: "Usage Alerts",
				icon: <BellIcon className="size-4" />,
			},
			{
				id: "transition-rules",
				label: "Transition Rules",
				icon: <ArrowRightLeftIcon className="size-4" />,
			},
		],
	},
	{
		label: "Integrations",
		items: [
			{
				id: "stripe",
				label: "Stripe",
				icon: <StripeIcon size={16} />,
			},
			{
				id: "vercel",
				label: "Vercel",
				icon: <TriangleIcon className="size-4" />,
			},
			{
				id: "revenuecat",
				label: "RevenueCat",
				icon: <RevenueCatIcon size={16} />,
			},
			{
				id: "atom",
				label: "Atom",
				icon: <AtomIcon className="size-4" />,
				badge: "PREVIEW",
			},
		],
	},
];

const SECTION_MAP: Record<SettingsTab, ReturnType<typeof lazySection>> = {
	account: AccountSection,
	organization: OrganizationSection,
	subscription: SubscriptionSection,
	members: MembersSection,
	agent: AgentSection,
	appearance: AppearanceSection,
	apps: AuthorizedAppsSection,
	sso: SsoSection,
	"custom-buttons": CustomButtonsSection,
	billing: BillingSettingsSection,
	invoices: InvoicesSection,
	"usage-alerts": UsageAlertsSection,
	"transition-rules": TransitionRulesSection,
	stripe: StripeSection,
	vercel: VercelSection,
	revenuecat: RevenueCatSection,
	atom: AtomSection,
};

/** Tabs that only render while their feature flag is on. */
const FLAGGED_TABS: Partial<Record<SettingsTab, "sso" | "vercel" | "atoms">> = {
	sso: "sso",
	vercel: "vercel",
	atom: "atoms",
};

/** Integrations were previously behind the developer page's scope. */
const API_KEY_SCOPED_TABS: readonly SettingsTab[] = [
	"stripe",
	"vercel",
	"revenuecat",
];

export const useIsSettingsTabEnabled = () => {
	const flags = useAutumnFlags();
	const { has } = useScopes();

	return (tab: SettingsTab) => {
		const flag = FLAGGED_TABS[tab];
		if (flag && !flags[flag]) return false;
		if (API_KEY_SCOPED_TABS.includes(tab)) return has(Scopes.ApiKeys.Read);
		return true;
	};
};

/** The tab the URL asks for, or Account when it isn't enabled; a flagged tab waits for billing instead of flashing Account first. */
const useActiveSettingsTab = (): SettingsTab => {
	const [searchParams] = useSearchParams();
	const isTabEnabled = useIsSettingsTabEnabled();
	const { isLoading: isLoadingFlags } = useAutumnFlags();
	const requestedTab = (searchParams.get("tab") as SettingsTab) || "account";
	const isAwaitingFlag = isLoadingFlags && requestedTab in FLAGGED_TABS;
	return isTabEnabled(requestedTab) || isAwaitingFlag
		? requestedTab
		: "account";
};

/** The settings nav beside the active tab's content. */
const SettingsFrame = ({
	activeTab,
	children,
}: {
	activeTab: SettingsTab;
	children: React.ReactNode;
}) => {
	const [, setSearchParams] = useSearchParams();
	const isTabEnabled = useIsSettingsTabEnabled();

	const handleTabChange = (tab: SettingsTab) => {
		setSearchParams({ tab }, { replace: true });
	};

	const activeGroup = SETTINGS_GROUPS.find((group) =>
		group.items.some((tab) => tab.id === activeTab),
	);

	const enabledGroups = SETTINGS_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((tab) => isTabEnabled(tab.id)),
	})).filter((group) => group.items.length > 0);

	return (
		<div className="flex h-full min-h-0">
			<nav className="hidden sm:flex w-[232px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r px-3 py-7">
				<span className="px-2.5 font-semibold text-foreground text-md tracking-tight">
					Settings
				</span>
				{enabledGroups.map((group) => {
					return (
						<div key={group.label} className="flex flex-col gap-px">
							<span className="px-2.5 pb-1.5 font-medium text-[#8A8A8A] text-xs leading-4 dark:text-[#6B6B6B]">
								{group.label}
							</span>
							{group.items.map((tab) => (
								<button
									key={tab.id}
									type="button"
									onClick={() => handleTabChange(tab.id)}
									className={cn(
										sidebarRowClass({ isActive: activeTab === tab.id }),
										"h-7 text-left",
									)}
								>
									{tab.label}
									{tab.badge && (
										<LabelTag label={tab.badge} className="ml-auto" />
									)}
								</button>
							))}
						</div>
					);
				})}
			</nav>
			<div className="min-w-0 flex-1 overflow-y-auto px-4 py-8 sm:px-[72px] sm:py-14">
				<div className="mx-auto max-w-[680px]">
					<Select
						value={activeTab}
						onValueChange={(tab) => handleTabChange(tab as SettingsTab)}
						items={Object.fromEntries(
							enabledGroups.flatMap((group) =>
								group.items.map((tab) => [tab.id, tab.label]),
							),
						)}
					>
						<SelectTrigger className="mb-6 w-full sm:hidden">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{enabledGroups.map((group) => (
								<SelectGroup key={group.label}>
									<SelectLabel>{group.label}</SelectLabel>
									{group.items.map((tab) => (
										<SelectItem key={tab.id} value={tab.id}>
											{tab.label}
										</SelectItem>
									))}
								</SelectGroup>
							))}
						</SelectContent>
					</Select>
					<SettingsGroupContext.Provider value={activeGroup?.label}>
						{children}
					</SettingsGroupContext.Provider>
				</div>
			</div>
		</div>
	);
};

export const SettingsView = () => {
	const activeTab = useActiveSettingsTab();
	// Warm every tab so switching renders immediately instead of suspending.
	useEffect(() => {
		for (const section of Object.values(SECTION_MAP)) void section.preload();
	}, []);
	const ActiveSection = SECTION_MAP[activeTab] ?? AccountSection;
	return (
		<SettingsFrame activeTab={activeTab}>
			<Suspense fallback={<SettingsSectionFallback tab={activeTab} />}>
				<ActiveSection />
			</Suspense>
		</SettingsFrame>
	);
};

/** Tabs whose loading state is drawn as their layout, so the page settles in place. */
const SECTION_SKELETONS: Partial<Record<SettingsTab, React.ComponentType>> = {
	atom: AtomSectionSkeleton,
};

/** Settings as it will render, while the org it needs still loads. */
export const SettingsViewSkeleton = () => {
	const activeTab = useActiveSettingsTab();
	return (
		<SettingsFrame activeTab={activeTab}>
			<SettingsSectionFallback tab={activeTab} />
		</SettingsFrame>
	);
};

const SettingsSectionFallback = ({ tab }: { tab: SettingsTab }) => {
	const SectionSkeleton = SECTION_SKELETONS[tab];
	if (!SectionSkeleton) return <LoadingScreen />;
	return (
		<Suspense fallback={<LoadingScreen />}>
			<SectionSkeleton />
		</Suspense>
	);
};
