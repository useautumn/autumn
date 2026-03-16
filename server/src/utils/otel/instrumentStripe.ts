import {
	context,
	type Span,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import type Stripe from "stripe";
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

const finalizeSpan = ({ span, error }: { span: Span; error?: unknown }) => {
	try {
		if (error) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			if (error instanceof Error) {
				span.recordException(error);
			} else {
				span.recordException(new Error(String(error)));
			}
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

		let span: Span;
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

		const activeContext = trace.setSpan(context.active(), span);

		try {
			const response = await context.with(activeContext, () =>
				originalMakeRequest(...args),
			);

			try {
				span.setAttribute(
					"http.response.status_code",
					response.getStatusCode(),
				);
			} catch {
				// Ignore response inspection failures and still return the original response
			}

			finalizeSpan({ span });
			return response;
		} catch (error) {
			finalizeSpan({ span, error });
			throw error;
		}
	};

	return client;
};
