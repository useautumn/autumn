import { Scopes } from "@autumn/shared";
import {
	ArrowRightLeftIcon,
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
import { useSearchParams } from "react-router";
import { RevenueCatIcon, StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useScopes } from "@/hooks/useScopes";
import { cn } from "@/lib/utils";
import { sidebarRowClass } from "@/views/main-sidebar/sidebarRowClass";
import { SettingsGroupContext } from "./SettingsSection";
import { AccountSection } from "./sections/AccountSection";
import { AgentSection } from "./sections/AgentSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AuthorizedAppsSection } from "./sections/AuthorizedAppsSection";
import { BillingSettingsSection } from "./sections/BillingSettingsSection";
import { CustomButtonsSection } from "./sections/CustomButtonsSection";
import { InvoicesSection } from "./sections/InvoicesSection";
import { MembersSection } from "./sections/MembersSection";
import { OrganizationSection } from "./sections/OrganizationSection";
import { RevenueCatSection } from "./sections/RevenueCatSection";
import { SsoSection } from "./sections/SsoSection";
import { StripeSection } from "./sections/StripeSection";
import { SubscriptionSection } from "./sections/SubscriptionSection";
import { TransitionRulesSection } from "./sections/TransitionRulesSection";
import { UsageAlertsSection } from "./sections/UsageAlertsSection";
import { VercelSection } from "./sections/VercelSection";

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
	| "revenuecat";

export interface SettingsNavItem {
	readonly id: SettingsTab;
	readonly label: string;
	readonly icon: React.ReactNode;
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
		],
	},
];

const SECTION_MAP: Record<SettingsTab, React.ComponentType> = {
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
};

/** Tabs that only render while their feature flag is on. */
const FLAGGED_TABS: Partial<Record<SettingsTab, "sso">> = {
	sso: "sso",
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

export const SettingsView = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const isTabEnabled = useIsSettingsTabEnabled();
	const requestedTab = (searchParams.get("tab") as SettingsTab) || "account";
	const activeTab = isTabEnabled(requestedTab) ? requestedTab : "account";
	const ActiveSection = SECTION_MAP[activeTab] ?? AccountSection;

	const handleTabChange = (tab: SettingsTab) => {
		setSearchParams({ tab }, { replace: true });
	};

	const activeGroup = SETTINGS_GROUPS.find((group) =>
		group.items.some((tab) => tab.id === activeTab),
	);

	return (
		<div className="flex h-full min-h-0">
			<nav className="hidden sm:flex w-[232px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r px-3 py-7">
				<span className="px-2.5 font-semibold text-foreground text-md tracking-tight">
					Settings
				</span>
				{SETTINGS_GROUPS.map((group) => {
					const enabledItems = group.items.filter((tab) =>
						isTabEnabled(tab.id),
					);
					if (enabledItems.length === 0) return null;
					return (
						<div key={group.label} className="flex flex-col gap-px">
							<span className="px-2.5 pb-1.5 font-medium text-[#8A8A8A] text-xs leading-4 dark:text-[#6B6B6B]">
								{group.label}
							</span>
							{enabledItems.map((tab) => (
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
								</button>
							))}
						</div>
					);
				})}
			</nav>
			<div className="min-w-0 flex-1 overflow-y-auto px-4 py-8 sm:px-[72px] sm:py-14">
				<div className="mx-auto max-w-[680px]">
					<SettingsGroupContext.Provider value={activeGroup?.label}>
						<ActiveSection />
					</SettingsGroupContext.Provider>
				</div>
			</div>
		</div>
	);
};
