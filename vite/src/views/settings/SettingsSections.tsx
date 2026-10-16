import { SettingsSectionSkeleton } from "./SettingsSection";
import type { SettingsTab } from "./SettingsView";
import { AccountSection } from "./sections/AccountSection";
import { AgentSection } from "./sections/AgentSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { AtomSection, AtomSectionSkeleton } from "./sections/AtomSection";
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
	atom: AtomSection,
};

/** Tabs whose loading state is drawn as their layout, so the page settles in place. */
const SECTION_SKELETONS: Partial<Record<SettingsTab, React.ComponentType>> = {
	atom: AtomSectionSkeleton,
};

export default function SettingsSections({
	tab,
	skeleton = false,
}: {
	tab: SettingsTab;
	skeleton?: boolean;
}) {
	const Section = skeleton
		? (SECTION_SKELETONS[tab] ?? SettingsSectionSkeleton)
		: (SECTION_MAP[tab] ?? AccountSection);
	return <Section />;
}
