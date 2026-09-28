import { ConfigureVercel } from "@/views/developer/configure-vercel/ConfigureVercel";
import { SettingsSection } from "../SettingsSection";

export const VercelSection = () => {
	return (
		<SettingsSection
			title="Vercel"
			description="Sell your plans through the Vercel Marketplace"
		>
			<ConfigureVercel />
		</SettingsSection>
	);
};
