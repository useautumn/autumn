import type { ApiByocCache } from "@autumn/shared";
import { AtomDetails, AtomDetailsSkeleton } from "./AtomDetails";
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
		<AtomMonitoring cache={cache} />
	</div>
);

/** The set-up Atom's layout while the page first loads, so its values settle in place rather than reflow. */
export const AtomSteadyStateSkeleton = () => (
	<div className="flex flex-col gap-10" aria-busy="true">
		<AtomDetailsSkeleton />
		<AtomMonitoring cache={null} isPending />
	</div>
);
