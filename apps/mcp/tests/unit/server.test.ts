import { describe, expect, test } from "bun:test";
import { createAutumnMcpHost } from "../../src/server.js";

const jsonRpc = (method: string, params?: Record<string, unknown>) =>
	new Request("http://localhost/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method,
			...(params ? { params } : {}),
		}),
	});

const parseJsonRpc = async (response: Response) => {
	const text = await response.text();
	const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
	const payload = dataLine ? dataLine.slice("data: ".length) : text;
	return JSON.parse(payload) as {
		result?: { tools?: Array<{ name: string }> };
		error?: { message: string };
	};
};

describe("createAutumnMcpHost", () => {
	test("lists the ping tool over Streamable HTTP", async () => {
		const server = createAutumnMcpHost();
		const response = await server.fetch(jsonRpc("tools/list"));
		const body = await parseJsonRpc(response);

		expect(response.status).toBe(200);
		expect(body.error).toBeUndefined();
		expect(body.result?.tools?.map((tool) => tool.name)).toEqual(["ping"]);
	});
});
