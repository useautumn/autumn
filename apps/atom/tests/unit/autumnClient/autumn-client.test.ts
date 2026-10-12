/**
 * The Atom's client for Autumn, against a fake Autumn: each call carries the token hash, a success is the parsed
 * answer, and any other reply rejects with AutumnClientError carrying Autumn's status and code.
 */

import { afterAll, expect, test } from "bun:test";
import {
	ATOM_KEYS_PATH,
	ATOM_SUBJECT_READ_PATH,
	ATOM_TOKEN_HASH_HEADER,
} from "@autumn/byoc";
import { AutumnClientError } from "../../../src/autumnClient/autumnClientError.js";
import { createAutumnClient } from "../../../src/autumnClient/createAutumnClient.js";

const autumn = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: async (request) => {
		const path = new URL(request.url).pathname;
		if (request.headers.get(ATOM_TOKEN_HASH_HEADER) !== "hash_folder")
			return Response.json({ code: "atom_unknown" }, { status: 401 });
		const body = await request.json();
		if (path === ATOM_KEYS_PATH)
			return Response.json({ invalid_key_hashes: body.key_hashes.slice(1) });
		if (path !== ATOM_SUBJECT_READ_PATH)
			return new Response("no such route", { status: 404 });
		if (body.customer_id === "cus_body")
			return new Response(`{"entity_id":${JSON.stringify(body.entity_id)}}`);
		if (body.customer_id === "cus_missing")
			return Response.json({ code: "subject_not_found" }, { status: 404 });
		return Response.json({ code: "worker_unavailable" }, { status: 503 });
	},
});
afterAll(() => autumn.stop(true));

const client = createAutumnClient({
	autumnApiUrl: `http://127.0.0.1:${autumn.port}`,
});

const rejectionOf = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(error: unknown) => error,
	);

test("readSubject returns Autumn's body as text, for the entity it names", async () => {
	expect(
		await client.readSubject({
			tokenHash: "hash_folder",
			customerId: "cus_body",
			entityId: "ent_1",
		}),
	).toBe('{"entity_id":"ent_1"}');
});

test("findInvalidKeys returns the hashes Autumn names invalid", async () => {
	expect(
		await client.findInvalidKeys({
			tokenHash: "hash_folder",
			keyHashes: ["key_a", "key_b"],
		}),
	).toEqual(["key_b"]);
});

test("any other answer rejects with Autumn's status and code, or a null code when it gave none", async () => {
	const read = (customerId: string, tokenHash = "hash_folder") =>
		rejectionOf(client.readSubject({ tokenHash, customerId, entityId: null }));

	expect(await read("cus_missing")).toMatchObject({
		status: 404,
		code: "subject_not_found",
	});
	expect(await read("cus_down")).toMatchObject({
		status: 503,
		code: "worker_unavailable",
	});
	const unknown = await read("cus_body", "hash_shadow");
	expect(unknown).toBeInstanceOf(AutumnClientError);
	expect(unknown).toMatchObject({ status: 401, code: "atom_unknown" });

	const oldServer = createAutumnClient({
		autumnApiUrl: `http://127.0.0.1:${autumn.port}/old`,
	});
	expect(
		await rejectionOf(
			oldServer.readSubject({
				tokenHash: "hash_folder",
				customerId: "cus_body",
				entityId: null,
			}),
		),
	).toMatchObject({ status: 404, code: null });
});

test("an Autumn that cannot be reached rejects, not as AutumnClientError", async () => {
	const unreachable = createAutumnClient({
		autumnApiUrl: "http://127.0.0.1:9",
	});
	const error = await rejectionOf(
		unreachable.readSubject({
			tokenHash: "hash_folder",
			customerId: "cus_body",
			entityId: null,
		}),
	);
	expect(error).toBeInstanceOf(Error);
	expect(error).not.toBeInstanceOf(AutumnClientError);
});
