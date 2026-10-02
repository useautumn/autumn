import { ShadowAtomDeploymentSection } from "./ShadowAtomDeploymentSection";
import { ShadowAtomOrgsSection } from "./ShadowAtomOrgsSection";

/** Staff-only: our one shadow Atom, serving both envs, and the orgs on it. */
export const ShadowAtomTab = () => (
	<div className="flex max-w-5xl flex-col gap-8">
		<ShadowAtomDeploymentSection />
		<ShadowAtomOrgsSection />
	</div>
);
