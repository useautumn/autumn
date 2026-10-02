import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomRolloutPanel } from "./ShadowAtomRolloutPanel";
import { ShadowAtomSectionBody } from "./ShadowAtomSectionBody";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomConfig } from "./useShadowAtomConfig";

export const ShadowAtomRolloutSection = ({ env }: { env: ShadowAtomEnv }) => {
	const { query, envConfig, saveRollout } = useShadowAtomConfig({ env });

	return (
		<RolloutSection
			title="Rollout"
			description="Which customers herald pushes to the shadow Atom and the API shadows; a percent change lands after the settle window."
		>
			<ShadowAtomSectionBody
				isError={query.isError}
				isPending={!envConfig}
				what="the shadow Atom config"
				onRetry={() => void query.refetch()}
			>
				{envConfig && (
					<ShadowAtomRolloutPanel
						rollout={envConfig.rollout}
						onSave={(rollout) =>
							saveRollout.mutateAsync({ rollout }).then(
								() => true,
								() => false,
							)
						}
						isSaving={saveRollout.isPending}
					/>
				)}
			</ShadowAtomSectionBody>
		</RolloutSection>
	);
};
