import type { AutumnLogger } from "@autumn/logging";

/** In a worker, an error that escapes `fetch` with no `error` handler closes the thread's listeners; this answers it instead. */
const answerEscapedError = ({
	error,
	logger,
}: {
	error: Error;
	logger: Pick<AutumnLogger, "error">;
}): Response => {
	try {
		logger.error(
			{ type: "atom_request_escaped", error },
			"A request failed past the app's error handler",
		);
	} catch {
		// The answer matters more than the line.
	}
	return Response.json(
		{ message: "Atom could not answer", code: "internal_error" },
		{ status: 500 },
	);
};

/** Every thread listens on the one port, and Linux gives each connection to one of them. */
export const serveAtomApp = ({
	hostname,
	port,
	fetch,
	logger,
}: {
	hostname: string;
	port: number;
	fetch: (request: Request) => Response | Promise<Response>;
	logger: Pick<AutumnLogger, "error">;
}) =>
	Bun.serve({
		hostname,
		port,
		reusePort: true,
		fetch,
		error: (error) => answerEscapedError({ error, logger }),
	});
