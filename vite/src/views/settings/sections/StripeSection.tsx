import { ConfigureStripe } from "@/views/developer/configure-stripe/ConfigureStripe";
import { EnvironmentBadge } from "../components/EnvironmentBadge";
import { SettingsSection } from "../SettingsSection";

export const StripeSection = () => {
	return (
		<SettingsSection
			title="Stripe"
			description="How Autumn talks to your Stripe account. These settings apply to the environment you're in."
			actions={<EnvironmentBadge />}
		>
			<ConfigureStripe />
		</SettingsSection>
	);
};
