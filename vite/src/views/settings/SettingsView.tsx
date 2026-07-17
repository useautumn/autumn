import { PageContainer, PageHeader } from "@autumn/ui";
import { GearIcon } from "@phosphor-icons/react";
import {
	ArrowRightLeftIcon,
	BellIcon,
	BotIcon,
	BuildingIcon,
	CreditCardIcon,
	MousePointerClickIcon,
	PaletteIcon,
	ReceiptIcon,
	ShieldCheckIcon,
	SlidersHorizontalIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { AccountSection } from "./sections/AccountSection";
import { AgentSection } from "./sections/AgentSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AuthorizedAppsSection } from "./sections/AuthorizedAppsSection";
import { BillingSettingsSection } from "./sections/BillingSettingsSection";
import { CustomButtonsSection } from "./sections/CustomButtonsSection";
import { InvoicesSection } from "./sections/InvoicesSection";
import { MembersSection } from "./sections/MembersSection";
import { OrganizationSection } from "./sections/OrganizationSection";
import { SubscriptionSection } from "./sections/SubscriptionSection";
import { TransitionRulesSection } from "./sections/TransitionRulesSection";
import { UsageAlertsSection } from "./sections/UsageAlertsSection";

type SettingsTab =
	| "account"
	| "organization"
	| "subscription"
	| "members"
	| "agent"
	| "appearance"
	| "apps"
	| "custom-buttons"
	| "billing"
	| "invoices"
	| "usage-alerts"
	| "transition-rules";

interface SettingsNavItem {
	readonly id: SettingsTab;
	readonly label: string;
	readonly icon: React.ReactNode;
}

interface SettingsNavGroup {
	readonly label: string;
	readonly items: readonly SettingsNavItem[];
}

const SETTINGS_GROUPS: readonly SettingsNavGroup[] = [
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
];

const SECTION_MAP: Record<SettingsTab, React.ComponentType> = {
	account: AccountSection,
	organization: OrganizationSection,
	subscription: SubscriptionSection,
	members: MembersSection,
	agent: AgentSection,
	appearance: AppearanceSection,
	apps: AuthorizedAppsSection,
	"custom-buttons": CustomButtonsSection,
	billing: BillingSettingsSection,
	invoices: InvoicesSection,
	"usage-alerts": UsageAlertsSection,
	"transition-rules": TransitionRulesSection,
};

export const SettingsView = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = (searchParams.get("tab") as SettingsTab) || "account";
	const ActiveSection = SECTION_MAP[activeTab] ?? AccountSection;

	const handleTabChange = (tab: SettingsTab) => {
		setSearchParams({ tab }, { replace: true });
	};

	return (
		<PageContainer className="flex-row gap-10 h-full">
			<nav className="hidden sm:flex flex-col w-44 shrink-0">
				<PageHeader
					icon={<GearIcon size={16} weight="fill" className="text-subtle" />}
					title="Settings"
				/>
				<div className="flex flex-col gap-5">
					{SETTINGS_GROUPS.map((group) => (
						<div key={group.label} className="flex flex-col gap-0.5">
							<span className="px-2 mb-1 text-xs font-medium text-subtle">
								{group.label}
							</span>
							{group.items.map((tab) => (
								<button
									key={tab.id}
									type="button"
									onClick={() => handleTabChange(tab.id)}
									className={cn(
										"flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer text-left",
										activeTab === tab.id
											? "bg-interactive-secondary text-foreground font-medium"
											: "text-tertiary-foreground hover:text-muted-foreground hover:bg-interactive-secondary/50",
									)}
								>
									{tab.icon}
									<span>{tab.label}</span>
								</button>
							))}
						</div>
					))}
				</div>
			</nav>
			<div className="flex-1 min-w-0">
				<ActiveSection />
			</div>
		</PageContainer>
	);
};
