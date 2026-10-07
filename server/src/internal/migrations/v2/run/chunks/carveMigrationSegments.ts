/** Keyset range `[floor, cursor)` on internal_id, walked DESC; an unset bound is open. */
export type MigrationSegment = { cursor?: string; floor?: string };

export type MigrationIdPage = { ids: string[]; isLastPage: boolean };

/** Walks the keyset one id page at a time; each page becomes a segment whose
 * floor is the page's last id, and the last page runs open-ended. */
export const carveMigrationSegments = async ({
	loadIdPage,
}: {
	loadIdPage: (args: { cursor?: string }) => Promise<MigrationIdPage>;
}): Promise<MigrationSegment[]> => {
	const segments: MigrationSegment[] = [];
	let cursor: string | undefined;
	while (true) {
		const { ids, isLastPage } = await loadIdPage({ cursor });
		if (ids.length === 0) return segments;
		const floor = ids[ids.length - 1];
		segments.push({ cursor, floor: isLastPage ? undefined : floor });
		if (isLastPage) return segments;
		cursor = floor;
	}
};
