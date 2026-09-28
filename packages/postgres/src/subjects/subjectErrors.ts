import type { z } from "zod/v4";

/** Postgres returned a row shape the envelope schema does not accept; nothing is guessed. */
export class SubjectRowsInvalidError extends Error {
	readonly issues: z.core.$ZodIssue[];

	constructor({ issues }: { issues: z.core.$ZodIssue[] }) {
		super(
			`Subject rows failed validation: ${issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ")}`,
		);
		this.name = "SubjectRowsInvalidError";
		this.issues = issues;
	}
}
