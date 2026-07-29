import { SettingsSection } from "../SettingsSection";
import { TransitionRulesSubsection } from "./components/TransitionRulesSubsection";

export const TransitionRulesSection = () => {
	return (
		<SettingsSection
			title="Transition Rules"
			description="Control how usage carries over when customers move between plans."
		>
			<TransitionRulesSubsection />
		</SettingsSection>
	);
};
