import { Hono } from "hono";
import { type Command, CommandBatchSchema } from "../api/types/command.js";
import type { CommandResult } from "../api/types/commandResult.js";
import type { Journal } from "../internal/journal/types/journal.js";
import type { Shard } from "../internal/shard/types/shard.js";
import { getDebugJournal } from "./getDebugJournal.js";

export const createLedgerApp = ({
	resolveShard,
	getJournal,
	exposeDebugRoutes = false,
}: {
	resolveShard: (params: { command: Command }) => Shard;
	getJournal: () => Journal;
	exposeDebugRoutes?: boolean;
}) => {
	const app = new Hono();

	app.get("/health", (c) => c.json({ ok: true }));

	// Lets a test read back what the shadow run appended.
	if (exposeDebugRoutes)
		app.get("/debug/journal", getDebugJournal({ getJournal }));

	app.post("/commands", async (c) => {
		const body = await c.req.json().catch(() => undefined);
		const parsed = CommandBatchSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(
				{
					message: "ledger: invalid command batch",
					issues: parsed.error.issues,
				},
				400,
			);
		}

		const results: CommandResult[] = await Promise.all(
			parsed.data.map((command) => resolveShard({ command }).run(command)),
		);
		return c.json(results);
	});

	return app;
};
