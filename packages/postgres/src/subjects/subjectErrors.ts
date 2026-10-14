import type { z } from "zod/v4";

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
