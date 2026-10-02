import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomOrgList } from "./ShadowAtomOrgList";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomConfig } from "./useShadowAtomConfig";
import { useShadowAtomOrgs } from "./useShadowAtomOrgs";

export const ShadowAtomOrgsSection = ({ env }: { env: ShadowAtomEnv }) => {
	const { envConfig } = useShadowAtomConfig({ env });
	const { register, unregister } = useShadowAtomOrgs({ env });

	return (
		<RolloutSection
			title="Orgs on the shadow Atom"
			description="Each registered org gets its own folder and token on the shadow Atom."
		>
			{envConfig ? (
				<ShadowAtomOrgList
					envConfig={envConfig}
					issued={register.data ?? null}
					onRegister={(params) => register.mutate(params)}
					onUnregister={(params) => unregister.mutate(params)}
					isRegistering={register.isPending}
					isUnregistering={unregister.isPending}
				/>
			) : (
				<div className="h-24 animate-pulse rounded-lg bg-muted" />
			)}
		</RolloutSection>
	);
};
