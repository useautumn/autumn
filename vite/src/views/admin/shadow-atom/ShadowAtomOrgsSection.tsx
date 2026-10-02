import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomOrgList } from "./ShadowAtomOrgList";
import { ShadowAtomSectionBody } from "./ShadowAtomSectionBody";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomConfig } from "./useShadowAtomConfig";
import { useShadowAtomNames } from "./useShadowAtomNames";
import { useShadowAtomOrgs } from "./useShadowAtomOrgs";

export const ShadowAtomOrgsSection = ({ env }: { env: ShadowAtomEnv }) => {
	const { query, envConfig } = useShadowAtomConfig({ env });
	const { register, unregister, isBusy } = useShadowAtomOrgs({ env });
	const names = useShadowAtomNames({ env });

	return (
		<RolloutSection
			title="Orgs on the shadow Atom"
			description="Each registered org gets its own folder and token on the shadow Atom."
		>
			<ShadowAtomSectionBody
				isError={query.isError}
				isPending={!envConfig}
				what="the shadow Atom config"
				onRetry={() => void query.refetch()}
			>
				{envConfig && (
					<ShadowAtomOrgList
						envConfig={envConfig}
						names={names}
						issued={register.data ?? null}
						onRegister={(params) =>
							register.mutateAsync(params).then(
								() => true,
								() => false,
							)
						}
						onUnregister={(params) => unregister.mutate(params)}
						isRegistering={register.isPending}
						isBusy={isBusy}
					/>
				)}
			</ShadowAtomSectionBody>
		</RolloutSection>
	);
};
