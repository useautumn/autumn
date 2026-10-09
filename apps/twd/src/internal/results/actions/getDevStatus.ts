import { sql } from "drizzle-orm";
import type { ResultSource } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { DevResult, FileDevStatus } from "../types/resultsSchemas.ts";
import { classifyDevResults } from "./classifyDevResults.ts";
import { BASELINE_BRANCH } from "./refreshBaselines.ts";
import { toTestId } from "./toTestId.ts";

type DevRow = {
	file: string;
	run_id: string;
	sha: string;
	status: DevResult["status"];
	attempt: number;
	source: ResultSource;
	created_at: Date | string;
};

/** Per file: passed / failing / flaky / no_data on dev, judged by the final attempt of its latest `limit` dev results (swarm and CI). */
export const getDevStatus = async ({
	ctx,
	files,
	limit,
}: {
	ctx: TwdContext;
	files: string[];
	limit: number;
}): Promise<FileDevStatus[]> => {
	const ids = [...new Set(files.map((file) => toTestId({ file })))];
	const rows = await ctx.db.execute<DevRow>(sql`
		with final as (
			select distinct on (run_id, file, coalesce(repetition, 0))
				file, run_id, sha, status, attempt, source, created_at
			from test_results
			where branch = ${BASELINE_BRANCH}
				and file in (${sql.join(
					ids.map((id) => sql`${id}`),
					sql`, `,
				)})
			order by run_id, file, coalesce(repetition, 0), attempt desc, created_at desc
		)
		select * from (
			select *, row_number() over (partition by file order by created_at desc) as rn
			from final
		) ranked
		where rn <= ${limit}
		order by file, created_at desc
	`);

	const recentByFile = new Map<string, DevResult[]>();
	for (const row of rows) {
		recentByFile.set(row.file, [
			...(recentByFile.get(row.file) ?? []),
			{
				status: row.status,
				sha: row.sha,
				source: row.source,
				runId: row.run_id,
				attempt: row.attempt,
				at: new Date(row.created_at).toISOString(),
			},
		]);
	}
	return ids.map((file) =>
		classifyDevResults({ file, recent: recentByFile.get(file) ?? [] }),
	);
};
