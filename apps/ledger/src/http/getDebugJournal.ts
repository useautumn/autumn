import type { Context } from "hono";
import { isMemoryJournal } from "../internal/journal/isMemoryJournal.js";
import type { Journal } from "../internal/journal/types/journal.js";

// Reads what the process has appended so far. Only the memory journal can be
// read back; a real broker answers an empty list.
export const getDebugJournal =
	({ getJournal }: { getJournal: () => Journal }) =>
	(c: Context) => {
		const journal = getJournal();
		if (!isMemoryJournal(journal)) return c.json({ entries: [] });

		const customerId = c.req.query("customer_id");
		const entries = customerId
			? journal.entries.filter((entry) => entry.customer_id === customerId)
			: journal.entries;

		return c.json({ entries });
	};
