import { Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ShadowAtomDeploymentSection } from "./ShadowAtomDeploymentSection";
import { ShadowAtomOrgsSection } from "./ShadowAtomOrgsSection";
import { ShadowAtomRolloutSection } from "./ShadowAtomRolloutSection";
import { SHADOW_ATOM_ENVS } from "./shadowAtomTypes";

/** Staff-only: our shadow Atom per env and whom it holds. */
export const ShadowAtomTab = () => {
	const [env, setEnv] = useQueryState(
		"shadow_env",
		parseAsStringLiteral(SHADOW_ATOM_ENVS).withDefault("sandbox"),
	);

	return (
		<div className="flex max-w-5xl flex-col gap-8">
			<Tabs
				value={env}
				onValueChange={(value) => void setEnv(value as typeof env)}
			>
				<TabsList>
					{SHADOW_ATOM_ENVS.map((option) => (
						<TabsTrigger key={option} value={option} className="capitalize">
							{option}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			<ShadowAtomDeploymentSection key={`deployment-${env}`} env={env} />
			<ShadowAtomRolloutSection key={`rollout-${env}`} env={env} />
			<ShadowAtomOrgsSection key={`orgs-${env}`} env={env} />
		</div>
	);
};
