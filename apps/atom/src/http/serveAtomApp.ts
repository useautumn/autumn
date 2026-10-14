import type { AutumnLogger } from "@autumn/logging";

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
	}
	return Response.json(
		{ message: "Atom could not answer", code: "internal_error" },
		{ status: 500 },
	);
};

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
