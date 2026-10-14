import type { ApiByocCache } from "@autumn/shared";
import { AtomDetails, AtomDetailsSkeleton } from "./AtomDetails";
import { cacheToMachine } from "./atomMachineDisplay";
import { AtomMonitoring } from "./monitoring/AtomMonitoring";

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

export const AtomSteadyStateSkeleton = () => (
	<div className="flex flex-col gap-10" aria-busy="true">
		<AtomDetailsSkeleton />
		<AtomMonitoring machine={null} isPending />
	</div>
);
