import { DatabaseError } from "pg";

/** What pg throws for an error Postgres sent: its SQLSTATE in `code`, its `severity` beside it. */
export const databaseError = ({
	message,
	code,
}: {
	message: string;
	code: string;
}): DatabaseError =>
	Object.assign(new DatabaseError(message, 0, "error"), {
		code,
		severity: "ERROR",
	});
