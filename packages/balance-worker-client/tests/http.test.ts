import { expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { createHttpClient } from "../src/http/createHttpClient.js";
import { HttpResponseError } from "../src/http/types/httpClient.js";

async function postsJsonAndParsesOnce(): Promise<void> {
	async function receive(request: Request): Promise<Response> {
		return Response.json({ received: await request.json() });
	}
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: receive });
	try {
		const http = createHttpClient({ config: { maxResponseBytes: 1024 } });
		expect(
			await http.postJson({
				url: server.url.href,
				body: { value: 1 },
				signal: AbortSignal.timeout(1000),
			}),
		).toEqual({ status: 200, body: { received: { value: 1 } } });
	} finally {
		await server.stop(true);
	}
}

async function enforcesResponseBoundaries(): Promise<void> {
	let redirected = 0;
	function receive(request: Request): Response {
		switch (new URL(request.url).pathname) {
			case "/redirect":
				return Response.redirect(`${server.url}followed`, 307);
			case "/followed":
				redirected++;
				return Response.json({});
			case "/html":
				return new Response("<html>");
			case "/bad":
				return new Response("{", {
					headers: { "content-type": "application/json" },
				});
			case "/large":
				return Response.json({ value: "x".repeat(1000) });
			default: {
				function start(
					controller: ReadableStreamDefaultController<Uint8Array>,
				): void {
					controller.enqueue(
						new TextEncoder().encode(
							JSON.stringify({ value: "x".repeat(1000) }),
						),
					);
					controller.close();
				}
				return new Response(new ReadableStream({ start }), {
					headers: { "content-type": "application/json" },
				});
			}
		}
	}
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: receive });
	const http = createHttpClient({ config: { maxResponseBytes: 100 } });
	try {
		for (const path of ["redirect", "html", "bad", "large", "chunked"]) {
			await expect(
				http.postJson({
					url: `${server.url}${path}`,
					body: {},
					signal: AbortSignal.timeout(1000),
				}),
			).rejects.toBeInstanceOf(HttpResponseError);
		}
		expect(redirected).toBe(0);
	} finally {
		await server.stop(true);
	}
}

async function bodyReadUsesRequestDeadline(): Promise<void> {
	function start(
		controller: ReadableStreamDefaultController<Uint8Array>,
	): void {
		controller.enqueue(new TextEncoder().encode('{"value":'));
	}
	function receive(): Response {
		return new Response(new ReadableStream({ start }), {
			headers: { "content-type": "application/json" },
		});
	}
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: receive });
	try {
		const http = createHttpClient({ config: { maxResponseBytes: 1024 } });
		await expect(
			http.postJson({
				url: server.url.href,
				body: {},
				signal: AbortSignal.timeout(30),
			}),
		).rejects.toThrow();
	} finally {
		await server.stop(true);
	}
}

async function nativeFetchDoesNotReplayPost(): Promise<void> {
	let posts = 0;
	const sockets = new Set<Socket>();
	function connect(socket: Socket): void {
		sockets.add(socket);
		function close(): void {
			sockets.delete(socket);
		}
		function data(chunk: Buffer): void {
			if (chunk.toString().startsWith("GET "))
				socket.write(
					"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\n{}",
				);
			else {
				posts++;
				socket.destroy();
			}
		}
		socket.on("data", data);
		socket.on("close", close);
	}
	const server = createServer(connect);
	const listening = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", listening.resolve);
	await listening.promise;
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing listener address");
	const url = `http://127.0.0.1:${address.port}`;
	try {
		await (await fetch(url)).json();
		await expect(
			fetch(url, {
				method: "POST",
				body: "{}",
				signal: AbortSignal.timeout(1000),
			}),
		).rejects.toThrow();
		expect(posts).toBe(1);
	} finally {
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		function onClosed(error?: Error): void {
			if (error) closed.reject(error);
			else closed.resolve();
		}
		server.close(onClosed);
		await closed.promise;
	}
}

test("shared transport posts and decodes JSON", postsJsonAndParsesOnce);
test(
	"rejects redirects, non-JSON, malformed and oversized bodies",
	enforcesResponseBoundaries,
);
test(
	"the deadline also interrupts the response body",
	bodyReadUsesRequestDeadline,
);
test(
	"pinned Bun does not replay POST after a pooled connection reset",
	nativeFetchDoesNotReplayPost,
);
