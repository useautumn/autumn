import type { SubjectCursor } from "../../state/repos/subjectStates.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { SubjectSource } from "../types/slots.js";
import { CATCH_UP_PAGE } from "./catchUpPage.js";
import { writeNewer } from "./writeNewer.js";

/** Every row the source wrote since `window`, page by page, each page starting past the last row of the one before: a fresh volume takes everything. */
export const copyRows = async ({
	store,
	source,
	slot,
	slotCount,
	window,
}: {
	store: SqliteStore;
	source: SubjectSource;
	slot: number;
	slotCount: number;
	window: number | null;
}): Promise<number> => {
	let written = 0;
	let after: number | null = null;
	let cursor: SubjectCursor | null = null;
	let first = true;
	for (;;) {
		const page = await source.since({
			slot,
			slotCount,
			after: first ? null : after,
			window: first ? window : null,
			cursor,
			limit: CATCH_UP_PAGE,
		});
		first = false;
		after = page.after;
		written += writeNewer({ store, page: page.subjects });
		const last = page.subjects.at(-1);
		if (!last || page.subjects.length < CATCH_UP_PAGE) break;
		cursor = {
			appliedAt: last.appliedAt,
			customerId: last.subject.state.identity.customerId,
			entityId: last.subject.state.identity.entityId ?? "",
		};
	}
	return written;
};
