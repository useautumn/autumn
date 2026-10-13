import { errorReportingOptionsOf } from "@autumn/errors/errorReportingOptions";
import * as Sentry from "@sentry/bun";

const errorReportingOptions = errorReportingOptionsOf();

if (errorReportingOptions) {
	Sentry.init({
		...errorReportingOptions,
		sendDefaultPii: true,
		skipOpenTelemetrySetup: true,
	});
}
