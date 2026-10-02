import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomDeploymentCard } from "./ShadowAtomDeploymentCard";
import { ShadowAtomSectionBody } from "./ShadowAtomSectionBody";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomDeployment } from "./useShadowAtomDeployment";

export const ShadowAtomDeploymentSection = ({
	env,
}: {
	env: ShadowAtomEnv;
}) => {
	const { query, create, resize, remove, isBusy } = useShadowAtomDeployment({
		env,
	});

	return (
		<RolloutSection
			title="Shadow Atom"
			description="Our own Atom on alien, from the same stack a customer's cache uses, in shared mode."
		>
			{/* A failed lookup must not read as "not deployed": Create would rotate a live Atom's admin token. */}
			<ShadowAtomSectionBody
				isError={query.isError}
				isPending={query.isPending}
				what="the shadow Atom's deployment"
				onRetry={() => void query.refetch()}
			>
				<ShadowAtomDeploymentCard
					deployment={query.data ?? null}
					created={create.data ?? null}
					onCreate={(machine) => create.mutate(machine)}
					onResize={(machine) => resize.mutate(machine)}
					onDelete={() => {
						if (window.confirm(`Delete the ${env} shadow Atom and its data?`))
							remove.mutate();
					}}
					isCreating={create.isPending}
					isResizing={resize.isPending}
					isDeleting={remove.isPending}
					isBusy={isBusy}
				/>
			</ShadowAtomSectionBody>
		</RolloutSection>
	);
};
