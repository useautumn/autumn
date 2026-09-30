export type TwdLogger = {
	info: (message: string, data?: Record<string, unknown>) => void;
	warn: (message: string, data?: Record<string, unknown>) => void;
	error: (message: string, data?: Record<string, unknown>) => void;
};

const write =
	(level: "info" | "warn" | "error") =>
	(message: string, data?: Record<string, unknown>) =>
		console[level](
			JSON.stringify({ level, message, ...data, at: new Date().toISOString() }),
		);

let logger: TwdLogger | undefined;
export const getLogger = (): TwdLogger => {
	logger ??= {
		info: write("info"),
		warn: write("warn"),
		error: write("error"),
	};
	return logger;
};
