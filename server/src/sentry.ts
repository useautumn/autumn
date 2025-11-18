import * as Sentry from "@sentry/bun";

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		sendDefaultPii: true,
	});
}
