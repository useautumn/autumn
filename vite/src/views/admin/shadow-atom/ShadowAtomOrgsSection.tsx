import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomOrgTable } from "./ShadowAtomOrgTable";
import { ShadowAtomSectionBody } from "./ShadowAtomSectionBody";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomConfig } from "./useShadowAtomConfig";
import { useShadowAtomNames } from "./useShadowAtomNames";
import { useShadowAtomOrgs } from "./useShadowAtomOrgs";

export const ShadowAtomOrgsSection = ({ env }: { env: ShadowAtomEnv }) => {
	const { query, envConfig } = useShadowAtomConfig({ env });
	const { add, setPercent, remove, isBusy } = useShadowAtomOrgs({ env });
	const names = useShadowAtomNames({ env });

	return (
		<RolloutSection
			title="Orgs on the shadow Atom"
			description="Each org's percent is the share of its customers pushed to the shadow Atom and checked against it."
		>
			<ShadowAtomSectionBody
				isError={query.isError}
				isPending={!envConfig}
				what="the shadow Atom config"
				onRetry={() => void query.refetch()}
			>
				{envConfig && (
					<ShadowAtomOrgTable
						envConfig={envConfig}
						names={names}
						issued={add.data ?? null}
						onAdd={(params) =>
							add.mutateAsync(params).then(
								() => true,
								() => false,
							)
						}
						onSetPercent={(params) => setPercent.mutate(params)}
						onRemove={(params) => remove.mutate(params)}
						isAdding={add.isPending}
						isBusy={isBusy}
					/>
				)}
			</ShadowAtomSectionBody>
		</RolloutSection>
	);
};
