const LABELLED_COMMANDS = new Set([
	"SELECT",
	"INSERT",
	"UPDATE",
	"DELETE",
	"BEGIN",
	"COMMIT",
	"ROLLBACK",
	"SAVEPOINT",
	"RELEASE",
	"SET",
]);

/** Leading SQL verb for diagnostics, so logs never carry statement text. */
export const sqlCommand = (text: string): string => {
	const verb = text.trimStart().split(/\s/, 1)[0].toUpperCase();
	return LABELLED_COMMANDS.has(verb) ? verb : "OTHER";
};
