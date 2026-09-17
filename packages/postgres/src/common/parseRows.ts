import type { z } from "zod/v4";

/** Postgres returned a row the shared schema does not accept; nothing is guessed. */
export class RowsInvalidError extends Error {
	readonly issues: z.core.$ZodIssue[];

	constructor({
		table,
		issues,
	}: { table: string; issues: z.core.$ZodIssue[] }) {
		super(
			`${table} rows failed validation: ${issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ")}`,
		);
		this.name = "RowsInvalidError";
		this.issues = issues;
	}
}

/** Every repo parses at the boundary the same way. */
export const parseRows = <Schema extends z.ZodType>({
	table,
	schema,
	rows,
}: {
	table: string;
	schema: Schema;
	rows: unknown[];
}): z.infer<Schema>[] => {
	const parsed = schema.array().safeParse(rows);
	if (!parsed.success) {
		throw new RowsInvalidError({ table, issues: parsed.error.issues });
	}
	return parsed.data;
};
