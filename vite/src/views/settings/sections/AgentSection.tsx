import { SettingsSection } from "../SettingsSection";
import { AgentRules } from "./components/AgentRules";
import { ChatConnections } from "./components/ChatConnections";

export const AgentSection = () => {
	return (
		<SettingsSection
			title="Agent"
			description="Configure how the Autumn agent works in your workspace"
		>
			<ChatConnections />
			<AgentRules />
		</SettingsSection>
	);
};
