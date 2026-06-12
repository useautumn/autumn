import { type AutumnClient, trackTokenUsage } from "../shared/track.js";
import { normalizeOpenRouterUsage, type OpenRouterUsageLike } from "./usage.js";

export type { AutumnClient } from "../shared/track.js";
export type { TokenPools } from "../shared/usage.js";
export type { OpenRouterUsageLike } from "./usage.js";

type ChatBody = {
	model?: string;
	usage?: { include?: boolean } | null;
	[key: string]: unknown;
};

/**
 * @openrouter/sdk >= 0.12 wraps the chat body in `chatRequest` (with header
 * params alongside); earlier shapes and the raw API are flat.
 */
type ChatSendRequest = ChatBody & {
	chatRequest?: ChatBody;
};

/** Both non-streaming results and stream chunks carry the resolved model slug and (on the final chunk) usage. */
type UsageCarrier = {
	model?: string | null;
	usage?: OpenRouterUsageLike | null;
};

/**
 * Structural view of the SDK's hooks surface. Standalone funcs (e.g. the
 * responses API behind @openrouter/agent's callModel) bypass instance
 * methods entirely, so usage for those flows is captured with an
 * afterSuccess hook instead of a method proxy. Response is kept structural
 * so the package works against DOM, undici and Bun fetch types alike.
 */
type ResponseLike = {
	headers: { get(name: string): string | null };
	clone(): ResponseLike;
	text(): Promise<string>;
	json(): Promise<unknown>;
};

type HookCapableClient = {
	_options?: {
		hooks?: {
			registerAfterSuccessHook?: (hook: {
				afterSuccess: <R extends ResponseLike>(
					ctx: { operationID: string },
					response: R,
				) => R | Promise<R>;
			}) => void;
		};
	};
};

/** Operations tracked via the afterSuccess hook; chat.send is handled by the method proxy. */
const HOOKED_OPERATIONS = new Set(["createResponses"]);

/** In-flight usage captures per wrapped client (streaming captures are fire-and-forget). */
const pendingTracking = new WeakMap<object, Set<Promise<void>>>();

/**
 * Resolves once all in-flight Autumn usage tracking for a wrapped client has
 * settled. Streaming responses (including @openrouter/agent's callModel,
 * which always streams internally) are tracked in the background — await
 * this before reading balances that must reflect the calls just made.
 */
export const trackingSettled = async (openRouter: object): Promise<void> => {
	const pending = pendingTracking.get(openRouter);
	while (pending && pending.size > 0) {
		await Promise.allSettled([...pending]);
	}
};

const findCarrier = (value: unknown): UsageCarrier | undefined => {
	if (value == null || typeof value !== "object") {
		return;
	}
	const record = value as UsageCarrier & { response?: unknown };
	if (record.usage && record.model) {
		return record;
	}
	// Responses stream events nest the result under `response`.
	return findCarrier(record.response);
};

const lastCarrierFromSse = (body: string): UsageCarrier | undefined => {
	let carrier: UsageCarrier | undefined;
	for (const line of body.split("\n")) {
		if (!line.startsWith("data:")) {
			continue;
		}
		try {
			carrier = findCarrier(JSON.parse(line.slice(5).trim())) ?? carrier;
		} catch {
			// Ignore non-JSON SSE payloads like "[DONE]".
		}
	}
	return carrier;
};

/** Structural view of the @openrouter/sdk client — only chat.send is intercepted. */
export type OpenRouterLike = {
	chat: {
		// biome-ignore lint/suspicious/noExplicitAny: param contravariance — `any` lets any concrete send signature satisfy this structurally.
		send: (request: any, ...rest: any[]) => Promise<unknown>;
	};
};

export type WithAutumnOptions<T extends OpenRouterLike> = {
	/** Autumn SDK client instance. */
	autumn: AutumnClient;
	/** The @openrouter/sdk client to wrap. */
	openRouter: T;
	/** The Autumn customer ID to attribute usage to. */
	customerId: string;
	/** Target a specific AI credit system feature. Auto-detected if omitted. */
	featureId?: string;
	/** Entity ID for entity-scoped balance tracking. */
	entityId?: string;
	/** Additional properties to attach to each usage event. */
	properties?: Record<string, unknown>;
};

const toModelId = (slug: string): string =>
	slug.startsWith("openrouter/") ? slug : `openrouter/${slug}`;

export type TrackOpenRouterUsageOptions = {
	autumn: AutumnClient;
	/** Usage object from an OpenRouter response (SDK model or raw API shape). */
	usage: OpenRouterUsageLike;
	/** OpenRouter model slug, e.g. "openai/gpt-4o". */
	model: string;
	customerId: string;
	featureId?: string;
	entityId?: string;
	properties?: Record<string, unknown>;
};

/** Manual escape hatch for consumption patterns the wrapped client doesn't cover (e.g. callModel). */
export const trackOpenRouterUsage = ({
	autumn,
	usage,
	model,
	customerId,
	featureId,
	entityId,
	properties,
}: TrackOpenRouterUsageOptions): Promise<void> => {
	const modelId = toModelId(model);
	return trackTokenUsage({
		autumn,
		getParams: () => ({
			...normalizeOpenRouterUsage(usage, modelId),
			customerId,
			modelId,
			featureId,
			entityId,
			properties: {
				...properties,
				...(usage.cost != null && { openrouter_cost: usage.cost }),
			},
		}),
	});
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	value != null &&
	typeof value === "object" &&
	Symbol.asyncIterator in value &&
	typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";

const hasUsage = (value: unknown): value is UsageCarrier & { usage: object } =>
	value != null &&
	typeof value === "object" &&
	"usage" in value &&
	(value as UsageCarrier).usage != null;

export const withAutumn = <T extends OpenRouterLike>({
	autumn,
	openRouter,
	customerId,
	featureId,
	entityId,
	properties,
}: WithAutumnOptions<T>): T => {
	const trackCarrier = (carrier: UsageCarrier, requestModel?: string) =>
		trackTokenUsage({
			autumn,
			getParams: () => {
				// Pricing is configured against the slug the caller requested;
				// providers may resolve it to a dated snapshot (e.g.
				// anthropic/claude-5-fable-20260609) that models.dev doesn't
				// list. Router pseudo-models (openrouter/auto) only resolve
				// server-side, so those fall back to the response slug.
				const requested = requestModel?.endsWith("/auto")
					? undefined
					: requestModel;
				const slug = requested ?? carrier.model ?? requestModel;
				if (!slug) {
					throw new Error(
						"[Autumn] OpenRouter response did not include a model slug.",
					);
				}
				const modelId = toModelId(slug);
				const usage = carrier.usage ?? {};
				return {
					...normalizeOpenRouterUsage(usage, modelId),
					customerId,
					modelId,
					featureId,
					entityId,
					properties: {
						...properties,
						...(usage.cost != null && { openrouter_cost: usage.cost }),
					},
				};
			},
		});

	const wrapStream = <S extends object>(
		stream: S,
		requestModel?: string,
	): S => {
		let tracked = false;

		// The SDK's stream is re-consumable; the guard keeps repeat iteration from double-tracking.
		async function* iterate(): AsyncGenerator<unknown> {
			let finalCarrier: UsageCarrier | undefined;
			try {
				for await (const chunk of stream as AsyncIterable<unknown>) {
					if (hasUsage(chunk)) {
						finalCarrier = chunk;
					}
					yield chunk;
				}
			} finally {
				if (finalCarrier && !tracked) {
					tracked = true;
					await trackCarrier(finalCarrier, requestModel);
				}
			}
		}

		return new Proxy(stream, {
			get(target, prop, receiver) {
				if (prop === Symbol.asyncIterator) {
					return () => iterate();
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	};

	const send = async (
		request: ChatSendRequest,
		...rest: unknown[]
	): Promise<unknown> => {
		// Usage accounting must be on for OpenRouter to return token counts
		// and cost. The body lives under `chatRequest` on @openrouter/sdk
		// >= 0.12 and at the top level on older shapes.
		const body = request.chatRequest ?? request;
		const bodyWithUsage: ChatBody = {
			...body,
			usage: { ...body.usage, include: true },
		};
		const requestWithUsage: ChatSendRequest = request.chatRequest
			? { ...request, chatRequest: bodyWithUsage }
			: bodyWithUsage;
		const result = await openRouter.chat.send(requestWithUsage, ...rest);

		if (isAsyncIterable(result)) {
			return wrapStream(result, body.model);
		}
		await trackCarrier(result as UsageCarrier, body.model);
		return result;
	};

	// Capture usage from API paths the method proxy can't see (the responses
	// API used by @openrouter/agent's callModel — each turn fires the hook).
	const captureHookedResponse = async (
		response: ResponseLike,
		contentType: string,
	): Promise<void> => {
		let carrier: UsageCarrier | undefined;
		if (contentType.includes("text/event-stream")) {
			carrier = lastCarrierFromSse(await response.text());
		} else if (contentType.includes("json")) {
			carrier = findCarrier(await response.json());
		}
		if (carrier) {
			await trackCarrier(carrier);
		}
	};

	const pending = new Set<Promise<void>>();
	pendingTracking.set(openRouter, pending);

	(openRouter as HookCapableClient)._options?.hooks?.registerAfterSuccessHook?.(
		{
			afterSuccess: (ctx, response) => {
				if (!HOOKED_OPERATIONS.has(ctx.operationID)) {
					return response;
				}
				const contentType = response.headers.get("content-type") ?? "";
				// The clone keeps the SDK's own body read untouched.
				const capture = captureHookedResponse(
					response.clone(),
					contentType,
				).catch((error) => {
					console.error("[Autumn Tracking] Failed to track usage:", error);
				});
				pending.add(capture);
				capture.finally(() => pending.delete(capture));
				// Await JSON captures so balances are settled when the call
				// returns; streams can't be awaited without buffering them —
				// callers needing settled balances use trackingSettled().
				return contentType.includes("text/event-stream")
					? response
					: capture.then(() => response);
			},
		},
	);

	const wrappedChat = new Proxy(openRouter.chat, {
		get(target, prop, receiver) {
			if (prop === "send") {
				return send;
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});

	const wrapped = new Proxy(openRouter, {
		get(target, prop, receiver) {
			if (prop === "chat") {
				return wrappedChat;
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	// trackingSettled accepts either the wrapped or the underlying client.
	pendingTracking.set(wrapped, pending);
	return wrapped;
};
