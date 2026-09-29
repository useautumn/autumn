import { ConfigureStripe } from "@/views/developer/configure-stripe/ConfigureStripe";
import { EnvironmentBadge } from "../components/EnvironmentBadge";
import { SettingsSection } from "../SettingsSection";

export const StripeSection = () => {
	return (
		<SettingsSection
			title="Stripe"
			description="How Autumn interacts and maps to your Stripe account."
			actions={<EnvironmentBadge />}
		>
			<ConfigureStripe />
		</SettingsSection>
	);
};
