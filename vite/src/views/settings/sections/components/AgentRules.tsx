import { useAgentRulesQuery } from "@/hooks/queries/useAgentRulesQuery";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { AgentRulesForm } from "./AgentRulesForm";

export const AgentRules = () => {
	const agent = useAgentRulesQuery();
	const { features } = useFeaturesQuery();

	return (
		<AgentRulesForm
			key={agent.rules?.updated_at ?? "new"}
			agent={agent}
			features={features}
		/>
	);
};
