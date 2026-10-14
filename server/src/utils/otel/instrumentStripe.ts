import {
	context,
	type Span,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import type Stripe from "stripe";
import { isMapleEnabled } from "@/external/maple/mapleEnabled.js";
import { otelConfig } from "./otelConfig.js";

const TRACER_NAME = "autumn.stripe";
const SPAN_NAME = "stripe.api";
const INSTRUMENTED = new WeakSet<object>();

type StripeHttpClient = NonNullable<Stripe.StripeConfig["httpClient"]>;

type StripeApiLike = {
	httpClient?: StripeHttpClient;
	stripeAccount?: string;
};

type MakeRequestArgs = Parameters<StripeHttpClient["makeRequest"]>;

const finalizeSpan = ({
	span,
	error,
	failed,
}: {
	span: Span;
	error?: unknown;
	/** Stripe answered with an error status; the SDK throws it after this span ends. */
	failed?: boolean;
}) => {
	try {
		if (error) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			if (error instanceof Error) {
				span.recordException(error);
			} else {
				span.recordException(new Error(String(error)));
			}
		} else if (failed) {
			span.setStatus({ code: SpanStatusCode.ERROR });
		} else {
			span.setStatus({ code: SpanStatusCode.OK });
		}
		span.end();
	} catch {
		// Fail-open: never let tracing affect Stripe client behavior
	}
};

const getStripeHttpClient = ({ client }: { client: Stripe }) => {
	try {
		return (client as unknown as { _api?: StripeApiLike })._api?.httpClient;
	} catch {
		return undefined;
	}
};

const getStripeAccount = ({ client }: { client: Stripe }) => {
	try {
		return (client as unknown as { _api?: StripeApiLike })._api?.stripeAccount;
	} catch {
		return undefined;
	}
};

export const instrumentStripe = ({ client }: { client: Stripe }): Stripe => {
	if (!otelConfig.stripe) return client;

	const httpClient = getStripeHttpClient({ client });
	if (!httpClient || INSTRUMENTED.has(httpClient)) return client;
	INSTRUMENTED.add(httpClient);

	const tracer = trace.getTracer(TRACER_NAME);
	const stripeAccount = getStripeAccount({ client });
	const originalMakeRequest = httpClient.makeRequest.bind(httpClient);

	httpClient.makeRequest = async function patchedMakeRequest(
		...args: MakeRequestArgs
	) {
		const [host, , path, method] = args;

		let span: Span | undefined;
		try {
			span = tracer.startSpan(SPAN_NAME, {
				kind: SpanKind.CLIENT,
				attributes: {
					"http.request.method": method,
					"server.address": host,
					"url.path": path,
					"stripe.path": path,
					...(stripeAccount ? { "stripe.account": stripeAccount } : {}),
				},
			});
		} catch {
			return originalMakeRequest(...args);
		}

		let activeContext = context.active();
		try {
			activeContext = trace.setSpan(activeContext, span);
		} catch {
			// Fall through — execute the request without context propagation
		}

		try {
			const response = await context.with(activeContext, () =>
				originalMakeRequest(...args),
			);

			let failed = false;
			try {
				const statusCode = response.getStatusCode();
				span.setAttribute("http.response.status_code", statusCode);
				failed = isMapleEnabled && statusCode >= 400;
			} catch {
				// Ignore response inspection failures
			}

			finalizeSpan({ span, failed });
			return response;
		} catch (error) {
			finalizeSpan({ span, error });
			throw error;
		}
	};

	return client;
};
