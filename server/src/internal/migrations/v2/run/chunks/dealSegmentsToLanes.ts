import type { MigrationSegment } from "./carveMigrationSegments.js";

/** Round-robin, like dealing cards: every lane gets a fixed, disjoint list up
 * front, so lanes never need shared state to agree on who owns a segment. */
export const dealSegmentsToLanes = ({
	segments,
	laneCount,
}: {
	segments: MigrationSegment[];
	laneCount: number;
}): MigrationSegment[][] => {
	const lanes = Math.min(laneCount, segments.length);
	return Array.from({ length: lanes }, (_, lane) =>
		segments.filter((_, index) => index % lanes === lane),
	);
};
