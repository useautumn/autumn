import { TwdError } from "../../../http/apiError.ts";

// Drops every user schema first, so the copy holds exactly the source's objects.
const RESET_SQL = `DO $$ DECLARE s text; BEGIN
FOR s IN SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' LOOP
EXECUTE format('DROP SCHEMA %I CASCADE', s); END LOOP;
CREATE SCHEMA public; END $$;`;

/** Replaces the `to` database with a pg_dump of `from`; URLs travel by env so they never reach logs. */
export const copyNeonDatabase = async ({
	from,
	to,
}: {
	from: string;
	to: string;
}) => {
	const proc = Bun.spawn(
		[
			"bash",
			"-o",
			"pipefail",
			"-c",
			`psql "$TO" -v ON_ERROR_STOP=1 -qc "$RESET_SQL" &&
			pg_dump -Fc --no-owner --no-acl "$FROM" | pg_restore --no-owner --no-acl --exit-on-error -d "$TO"`,
		],
		{
			env: { ...process.env, FROM: from, TO: to, RESET_SQL },
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	const [code, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
	]);
	if (code !== 0)
		throw new TwdError({
			status: 502,
			code: "neon_copy_failed",
			message: `Copying the Capy database into the QA branch failed (exit ${code}): ${stderr.slice(-500)}`,
			next: "Retry qa_create; if it keeps failing, ask a twd admin to check pg_dump on twd.",
		});
};
