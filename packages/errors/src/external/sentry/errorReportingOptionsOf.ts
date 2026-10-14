import * as Sentry from "@sentry/bun";
import { makeMultiplexedTransport } from "@sentry/core";

export const errorReportingOptionsOf = ({
	env = process.env,
}: {
	env?: NodeJS.ProcessEnv;
} = {}): Pick<Sentry.BunOptions, "dsn" | "transport"> | undefined => {
	const dsns = [env.SAZABI_DSN, env.SENTRY_DSN].filter((dsn): dsn is string =>
		Boolean(dsn),
	);
	const [dsn] = dsns;
	if (!dsn) return undefined;
	if (dsns.length === 1) return { dsn };

	return {
		dsn,
		transport: makeMultiplexedTransport(Sentry.makeFetchTransport, () => dsns),
	};
};
