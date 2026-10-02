import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomOrgTable } from "./ShadowAtomOrgTable";
import { ShadowAtomSectionBody } from "./ShadowAtomSectionBody";
import { useShadowAtomConfig } from "./useShadowAtomConfig";
import { useShadowAtomNames } from "./useShadowAtomNames";
import { useShadowAtomOrgs } from "./useShadowAtomOrgs";

export const ShadowAtomOrgsSection = () => {
	const query = useShadowAtomConfig();
	const { add, setPercent, remove, isBusy } = useShadowAtomOrgs();
	const names = useShadowAtomNames();

	return (
		<RolloutSection
			title="Orgs on the shadow Atom"
			description="Each org's percent is the share of its customers, sandbox and live, pushed to the shadow Atom and checked against it."
		>
			<ShadowAtomSectionBody
				isError={query.isError}
				isPending={!query.data}
				what="the shadow Atom config"
				onRetry={() => void query.refetch()}
			>
				{query.data && (
					<ShadowAtomOrgTable
						config={query.data}
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
