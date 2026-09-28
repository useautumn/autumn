import type { z } from "zod";
import { ApiError } from "../../../src/api/contract.ts";
import { createMockTransport } from "../mock/mockTransport.ts";

export type ApiErrorBody = z.infer<typeof ApiError>["error"];

/** Every failed call surfaces as this, carrying the contract's error envelope. */
export class ApiRequestError extends Error {
	readonly status: number;
	readonly body: ApiErrorBody;
	constructor({ status, body }: { status: number; body: ApiErrorBody }) {
		super(body.message);
		this.status = status;
		this.body = body;
	}
}

export type Method = "GET" | "POST" | "DELETE";

export type LiveHandlers = {
	onOpen: () => void;
	onMessage: (text: string) => void;
	onClose: () => void;
};
export type LiveConnection = {
	send: (text: string) => void;
	close: () => void;
};

export type Transport = {
	request: (args: {
		method: Method;
		path: string;
		body?: unknown;
	}) => Promise<{ status: number; contentType: string; data: unknown }>;
	/** Opens the live socket (GET /ws); messages are raw JSON text either way. */
	openLive: (handlers: LiveHandlers) => LiveConnection;
	signInUrl: string;
};

export const isMock =
	import.meta.env.VITE_TWD_MOCK === "1" || !import.meta.env.VITE_TWD_URL;

const apiBase = import.meta.env.VITE_TWD_API_BASE ?? "/api";

/** Public origin agents and curl should call (the twd server, not this dev server). */
export const twdOrigin = (
	import.meta.env.VITE_TWD_URL || window.location.origin
).replace(/\/$/, "");

const httpTransport: Transport = {
	signInUrl: `${apiBase}/auth/google`,
	request: async ({ method, path, body }) => {
		const res = await fetch(`${apiBase}${path}`, {
			method,
			credentials: "include",
			headers: body === undefined ? {} : { "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const contentType = res.headers.get("content-type") ?? "";
		const data = contentType.includes("json")
			? await res.json()
			: await res.text();
		return { status: res.status, contentType, data };
	},
	openLive: ({ onOpen, onMessage, onClose }) => {
		const url = new URL(`${apiBase}/ws`, window.location.href);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		const socket = new WebSocket(url);
		socket.onopen = onOpen;
		socket.onmessage = (event) => onMessage(String(event.data));
		socket.onclose = onClose;
		return {
			send: (text) => {
				if (socket.readyState === WebSocket.OPEN) socket.send(text);
			},
			close: () => {
				socket.onclose = null;
				socket.close();
			},
		};
	},
};

export const transport: Transport = isMock
	? createMockTransport()
	: httpTransport;

const send = (args: Parameters<Transport["request"]>[0]) =>
	transport.request(args).catch((cause: unknown) => {
		console.error(`twd ${args.method} ${args.path} failed`, cause);
		return { status: 0, contentType: "", data: null };
	});

const toApiError = ({ status, data }: { status: number; data: unknown }) => {
	const parsed = ApiError.safeParse(data);
	if (parsed.success)
		return new ApiRequestError({ status, body: parsed.data.error });
	return new ApiRequestError({
		status,
		body: {
			code: status === 0 ? "network" : `http_${status}`,
			message:
				status === 0
					? "Could not reach twd."
					: `twd returned ${status} without an error envelope.`,
			next:
				status === 0
					? "Check that twd is running and VITE_TWD_URL points at it."
					: "Retry once; if it repeats, report it.",
			escalate: null,
		},
	});
};

/** Calls one contract route and validates the response with its zod schema. */
export const api = async <S extends z.ZodTypeAny>({
	method = "GET",
	path,
	body,
	schema,
}: {
	method?: Method;
	path: string;
	body?: unknown;
	schema: S;
}): Promise<z.infer<S>> => {
	const res = await send({ method, path, body });
	if (res.status === 0 || res.status >= 400) throw toApiError(res);
	const parsed = schema.safeParse(res.data);
	if (parsed.success) return parsed.data;
	throw new ApiRequestError({
		status: res.status,
		body: {
			code: "contract_mismatch",
			message: `${method} ${path} returned a body that does not match the contract.`,
			next: "The server and dashboard disagree on src/api/contract.ts; redeploy both from the same commit.",
			escalate: null,
			details: { issues: parsed.error.issues.slice(0, 5) },
		},
	});
};

/** Plain-text routes (file logs). */
export const apiText = async ({ path }: { path: string }) => {
	const res = await send({ method: "GET", path });
	if (res.status === 0 || res.status >= 400) throw toApiError(res);
	if (typeof res.data === "string") return res.data;
	const maybe = res.data as { log?: unknown; text?: unknown } | null;
	return String(maybe?.log ?? maybe?.text ?? "");
};
