import { onUnknownInput, type UnknownInput } from "./openSchema.js";

type UnknownInputLogger = {
	warn: (data: Record<string, unknown>, message: string) => void;
	error: (data: Record<string, unknown>, message: string) => void;
};

/** Sends each first sighting of an unknown input to the process's logger: a new enum value is a warning, a skipped change is an error. */
export const logUnknownInput = ({
	logger,
}: {
	logger: UnknownInputLogger;
}): void => {
	onUnknownInput((input: UnknownInput) => {
		if (input.kind === "enum_value") {
			logger.warn(
				{ type: "unknown_enum_value", data: input },
				`Read an unknown ${input.schema} value from a newer build; carried as-is`,
			);
			return;
		}
		if (input.kind === "row_column") {
			logger.error(
				{ type: "unknown_row_column_skipped", data: input },
				`Skipped the ${input.table}.${input.column} column from a newer build; this build does not write it to Postgres`,
			);
			return;
		}
		logger.error(
			{ type: "unknown_row_change_skipped", data: input },
			`Skipped a ${input.table} ${input.op} change from a newer build; this build writes none of its rows`,
		);
	});
};
