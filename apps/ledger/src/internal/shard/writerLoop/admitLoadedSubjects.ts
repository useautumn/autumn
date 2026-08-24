import { insertSubjectRows } from "../../subjects/actions/insertSubjectRows.js";
import type { ShardContext } from "../types/shardContext.js";

// Imported rows land here, between transactions: the writer loop holds an open
// BEGIN across the journal append, so an async import must never write inside it.
export const admitLoadedSubjects = ({ ctx }: { ctx: ShardContext }): void => {
	for (const imported of ctx.subjects.takeLoaded()) {
		insertSubjectRows({ ctx, imported });
		ctx.subjects.markResident({ key: imported.key });
	}
};
