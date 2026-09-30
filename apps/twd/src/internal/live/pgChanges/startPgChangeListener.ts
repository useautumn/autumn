import postgres from "postgres";
import { createContext, SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import { publishTableChange } from "./publishTableChange.ts";

export const PG_CHANGES_CHANNEL = "twd_changes";
/** Coalesces bursts (e.g. per-file progress writes) into one publish per row. */
const COALESCE_MS = 150;

type TableChange = { t: string; id: string };

/** LISTENs for the row-change triggers so every DB mutation reaches live clients, whatever wrote it. */
export const startPgChangeListener = async (): Promise<() => Promise<void>> => {
	const ctx = createContext({ actor: SYSTEM_ACTOR });
	const sql = postgres(ctx.env.TWD_DATABASE_URL, { max: 1 });
	const pending = new Map<string, TableChange>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const flush = () => {
		timer = undefined;
		const changes = [...pending.values()];
		pending.clear();
		for (const change of changes) {
			void publishTableChange({ ctx, table: change.t, id: change.id }).catch(
				(error: unknown) =>
					ctx.logger.warn("live publish failed", {
						table: change.t,
						id: change.id,
						error: String(error),
					}),
			);
		}
	};

	const { unlisten } = await sql.listen(PG_CHANGES_CHANNEL, (payload) => {
		const change = JSON.parse(payload) as TableChange;
		pending.set(`${change.t}:${change.id}`, change);
		timer ??= setTimeout(flush, COALESCE_MS);
	});

	return async () => {
		await unlisten();
		await sql.end();
	};
};
