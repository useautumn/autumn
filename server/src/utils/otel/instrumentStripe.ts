import {
	context,
	type Span,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import type Stripe from "stripe";
import { otelConfig } from "./otelConfig.js";

type AnyFn = (...args: unknown[]) => unknown;

const TRACER_NAME = "autumn.stripe";
const INSTRUMENTED = new WeakSet<object>();

/** Ends a span safely — never throws. */
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
		// OTel internals failed — swallow so we never mask application results
	}
};

/**
 * Wraps a Stripe client in a Proxy that creates OTel spans for every
 * `stripeCli.{resource}.{method}()` call. Zero changes at callsites.
 *
 * Fail-open: every OTel interaction is wrapped in try/catch. If anything
 * in the tracing layer fails, the original Stripe method runs unmodified
 * and returns its result as if instrumentation didn't exist.
 *
 * Memory-safe: proxies hold no request-scoped state.
 */
export const instrumentStripe = ({ client }: { client: Stripe }): Stripe => {
	if (!otelConfig.stripe) return client;
	if (INSTRUMENTED.has(client)) return client;
	INSTRUMENTED.add(client);

	const tracer = trace.getTracer(TRACER_NAME);

	// Try to read the connected account ID for span attributes.
	// This is an internal Stripe SDK property — safe to fail silently.
	let stripeAccount: string | undefined;
	try {
		stripeAccount = (
			client as unknown as Record<string, Record<string, unknown>>
		)._api?.stripeAccount as string | undefined;
	} catch {
		// ignore
	}

	return new Proxy(client, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);

			// Only intercept string-keyed object properties (resource namespaces).
			// Symbols, primitives, functions on the top-level client pass through.
			if (
				typeof prop !== "string" ||
				value === null ||
				typeof value !== "object"
			) {
				return value;
			}

			// Return a Proxy for the resource namespace (e.g. .customers, .subscriptions)
			return new Proxy(value as Record<string, unknown>, {
				get(resourceTarget, methodProp, resourceReceiver) {
					const methodValue = Reflect.get(
						resourceTarget,
						methodProp,
						resourceReceiver,
					);

					// Only wrap functions (e.g. .create, .update, .list, .retrieve, .del)
					if (typeof methodValue !== "function") {
						return methodValue;
					}

					// Return a wrapper that creates a span around the original call
					return function wrappedStripeMethod(
						this: unknown,
						...args: unknown[]
					) {
						// Try to create a span + set context. If ANY of this
						// fails, fall back to calling the original directly.
						let span: Span | undefined;
						let runInContext: (<T>(fn: () => T) => T) | undefined;

						try {
							span = tracer.startSpan(`stripe.${prop}.${String(methodProp)}`, {
								kind: SpanKind.CLIENT,
							});
							span.setAttribute("stripe.resource", prop);
							span.setAttribute("stripe.method", String(methodProp));
							if (stripeAccount) {
								span.setAttribute("stripe.account", stripeAccount);
							}

							const activeContext = trace.setSpan(context.active(), span);
							runInContext = <T>(fn: () => T): T =>
								context.with(activeContext, fn);
						} catch {
							// Fail-open: span/context setup failed, call original unmodified
							return (methodValue as AnyFn).apply(resourceTarget, args);
						}

						// Call the original method — inside the OTel context
						// if setup succeeded, otherwise unreachable (caught above).
						const callOriginal = () =>
							(methodValue as AnyFn).apply(resourceTarget, args);

						try {
							const result = runInContext(callOriginal);

							// Async path (all Stripe API methods return Promises)
							if (
								result &&
								typeof (result as Promise<unknown>).then === "function"
							) {
								return (result as Promise<unknown>).then(
									(val) => {
										finalizeSpan({ span: span! });
										return val;
									},
									(err) => {
										finalizeSpan({
											span: span!,
											error: err,
										});
										throw err;
									},
								);
							}

							// Sync path (e.g. webhooks.constructEvent)
							finalizeSpan({ span: span! });
							return result;
						} catch (err) {
							finalizeSpan({ span: span!, error: err });
							throw err;
						}
					};
				},
			});
		},
	});
};
