import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomRolloutPanel } from "./ShadowAtomRolloutPanel";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomConfig } from "./useShadowAtomConfig";

export const ShadowAtomRolloutSection = ({ env }: { env: ShadowAtomEnv }) => {
	const { envConfig, saveRollout } = useShadowAtomConfig({ env });

	return (
		<RolloutSection
			title="Rollout"
			description="Which customers herald pushes to the shadow Atom and the API shadows; a percent change lands after the settle window."
		>
			{envConfig ? (
				<ShadowAtomRolloutPanel
					rollout={envConfig.rollout}
					onSave={(rollout) => saveRollout.mutate({ rollout })}
					isSaving={saveRollout.isPending}
				/>
			) : (
				<div className="h-24 animate-pulse rounded-lg bg-muted" />
			)}
		</RolloutSection>
	);
};
