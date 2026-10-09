import type { ApiByocCache } from "@autumn/shared";
import { AtomDetails } from "./AtomDetails";
import { cacheToMachine } from "./atomMachineDisplay";
import { AtomMonitoring } from "./monitoring/AtomMonitoring";

/** A connected Atom: where it runs and how to reach it, then how it is doing. */
export const AtomSteadyState = ({
	cache,
	onDelete,
}: {
	cache: ApiByocCache;
	onDelete: () => void;
}) => (
	<div className="flex flex-col gap-10">
		<AtomDetails cache={cache} onDelete={onDelete} />
		<AtomMonitoring machine={cacheToMachine(cache)} />
	</div>
);
