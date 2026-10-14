import { DatabaseError } from "pg";

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
