/** The error a log call carries: passed bare, or under `error` / `err` in its fields object. */
export type LoggedError = {
	error: Error;
	argIndex: number;
	key?: "error" | "err";
};

const isFieldsObject = (arg: unknown): arg is Record<string, unknown> =>
	typeof arg === "object" && arg !== null && !(arg instanceof Error);

export const findLoggedError = ({
	args,
}: {
	args: unknown[];
}): LoggedError | undefined => {
	for (const [argIndex, arg] of args.entries()) {
		if (arg instanceof Error) return { error: arg, argIndex };
		if (!isFieldsObject(arg)) continue;
		if (arg.error instanceof Error) {
			return { error: arg.error, argIndex, key: "error" };
		}
		if (arg.err instanceof Error)
			return { error: arg.err, argIndex, key: "err" };
	}
};
