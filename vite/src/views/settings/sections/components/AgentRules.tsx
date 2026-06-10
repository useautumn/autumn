import { useAgentRulesQuery } from "@/hooks/queries/useAgentRulesQuery";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { AgentRulesForm } from "./AgentRulesForm";

export const AgentRules = () => {
	const agent = useAgentRulesQuery();
	const { features } = useFeaturesQuery();

	// Re-key on saved state so the form re-baselines after each save/generate.
	return (
		<AgentRulesForm
			key={agent.rules?.updated_at ?? "new"}
			agent={agent}
			features={features}
		/>
	);
};
