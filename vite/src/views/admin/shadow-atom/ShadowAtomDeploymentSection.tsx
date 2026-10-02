import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomDeploymentCard } from "./ShadowAtomDeploymentCard";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { useShadowAtomDeployment } from "./useShadowAtomDeployment";

export const ShadowAtomDeploymentSection = ({
	env,
}: {
	env: ShadowAtomEnv;
}) => {
	const { query, create, resize, remove } = useShadowAtomDeployment({ env });

	return (
		<RolloutSection
			title="Shadow Atom"
			description="Our own Atom on alien, from the same stack a customer's cache uses, in shared mode."
		>
			{query.isPending ? (
				<div className="h-32 animate-pulse rounded-lg bg-muted" />
			) : (
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
				/>
			)}
		</RolloutSection>
	);
};
