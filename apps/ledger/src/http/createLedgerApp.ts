import { Hono } from "hono";
import {
	type Command,
	CommandBatchSchema,
	type CommandResult,
} from "../../client/types/command.js";
import type { Shard } from "../internal/shard/types/shard.js";

export const createLedgerApp = ({
	resolveShard,
}: {
	resolveShard: (params: { command: Command }) => Shard;
}) => {
	const app = new Hono();

	app.get("/health", (c) => c.json({ ok: true }));

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
