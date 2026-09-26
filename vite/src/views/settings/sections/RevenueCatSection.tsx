import { ConfigureRevenueCat } from "@/views/developer/configure-revenuecat/ConfigureRevenueCat";
import { SettingsSection } from "../SettingsSection";

export const RevenueCatSection = () => {
	return (
		<SettingsSection
			title="RevenueCat"
			description="Sync in-app subscriptions from RevenueCat"
		>
			<ConfigureRevenueCat />
		</SettingsSection>
	);
};
