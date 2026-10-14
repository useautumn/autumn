import { errorReportingOptionsOf } from "@autumn/errors";
import * as Sentry from "@sentry/bun";

const errorReportingOptions = errorReportingOptionsOf();

if (errorReportingOptions) {
	Sentry.init({
		...errorReportingOptions,
		sendDefaultPii: true,
		skipOpenTelemetrySetup: true,
	});
}
