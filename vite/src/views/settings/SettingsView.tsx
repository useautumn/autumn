import {
	BuildingIcon,
	CreditCardIcon,
	PaletteIcon,
	ShieldCheckIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { PageContainer } from "@/components/general/PageContainer";
import { cn } from "@/lib/utils";
import { AccountSection } from "./sections/AccountSection";
import { OrganizationSection } from "./sections/OrganizationSection";
import { MembersSection } from "./sections/MembersSection";
import { AuthorizedAppsSection } from "./sections/AuthorizedAppsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { BillingSettingsSection } from "./sections/BillingSettingsSection";

type SettingsTab = "account" | "organization" | "members" | "billing" | "appearance" | "apps";

interface SettingsNavItem {
	readonly id: SettingsTab;
	readonly label: string;
	readonly icon: React.ReactNode;
}

const SETTINGS_TABS: readonly SettingsNavItem[] = [
	{ id: "account", label: "Account", icon: <UserIcon className="size-4" /> },
	{
		id: "organization",
		label: "Organization",
		icon: <BuildingIcon className="size-4" />,
	},
	{
		id: "members",
		label: "Members",
		icon: <UsersIcon className="size-4" />,
	},
	{
		id: "billing",
		label: "Billing",
		icon: <CreditCardIcon className="size-4" />,
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
] as const;

const SECTION_MAP: Record<SettingsTab, React.ComponentType> = {
	account: AccountSection,
	organization: OrganizationSection,
	members: MembersSection,
	billing: BillingSettingsSection,
	appearance: AppearanceSection,
	apps: AuthorizedAppsSection,
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
			<nav className="hidden sm:flex flex-col w-44 shrink-0 pt-1">
				<h1 className="text-sm font-semibold text-foreground mb-4">Settings</h1>
				<div className="flex flex-col gap-0.5">
					{SETTINGS_TABS.map((tab) => (
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
			</nav>
			<div className="flex-1 min-w-0">
				<ActiveSection />
			</div>
		</PageContainer>
	);
};
