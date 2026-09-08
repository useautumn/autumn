import { afterAll, describe, expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

// End-to-end over HTTP: a MAIN-org secret key drives the whole public sandbox
// lifecycle, and the key it mints works on the sandbox. Requires `bun dw`.

const { db } = initDrizzle();
const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
const masterKey = defaultCtx.orgSecretKey;

const post = async ({
	path,
	body,
	key,
}: {
	path: string;
	body: unknown;
	key: string;
}) =>
	await fetch(`${apiBase}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

type Sandbox = {
	id: string;
	name: string;
	slug: string;
	created_at: number;
	color: string;
	icon: string;
};

const listSandboxIds = async (): Promise<string[]> => {
	const res = await post({ path: "/sandboxes.list", body: {}, key: masterKey });
	expect(res.status).toBe(200);
	const { list } = (await res.json()) as { list: Sandbox[] };
	return list.map((sandbox) => sandbox.id);
};

const sandboxName = `Secret Key Lifecycle ${crypto.randomUUID()}`;
let created: Sandbox & { secret_key: string };

afterAll(async () => {
	if (!created?.id) return;
	await db
		.delete(organizations)
		.where(eq(organizations.id, created.id))
		.catch(() => {});
});

describe("sandbox lifecycle driven entirely by a main-org secret key", () => {
	test("create returns the sandbox plus its own key, shown once", async () => {
		const res = await post({
			path: "/sandboxes.create",
			body: { name: sandboxName, color: "green", icon: "Flask" },
			key: masterKey,
		});
		expect(res.status).toBe(200);

		created = (await res.json()) as Sandbox & { secret_key: string };
		expect(created.name).toBe(sandboxName);
		expect(created.color).toBe("green");
		expect(created.slug).toContain("secret-key-lifecycle");
		expect(created.secret_key).toMatch(/^am_sk_test/);
		expect(typeof created.created_at).toBe("number");
		expect(created.created_at).toBeGreaterThan(0);
	}, 120_000);

	test("the new sandbox appears in list, with created_at as epoch ms", async () => {
		const res = await post({
			path: "/sandboxes.list",
			body: {},
			key: masterKey,
		});
		expect(res.status).toBe(200);

		const { list } = (await res.json()) as { list: Sandbox[] };
		const found = list.find((sandbox) => sandbox.id === created.id);
		expect(found).toBeDefined();
		expect(typeof found?.created_at).toBe("number");
		expect(Object.keys(found ?? {})).not.toContain("secret_key");
	});

	test("the returned key authenticates ordinary API calls against the sandbox", async () => {
		const res = await post({
			path: "/customers.list",
			body: {},
			key: created.secret_key,
		});
		expect(res.status).toBe(200);
	});

	test("the sandbox's own key cannot manage sandboxes (assertNotSandboxContext, 400)", async () => {
		const res = await post({
			path: "/sandboxes.list",
			body: {},
			key: created.secret_key,
		});
		expect(res.status).toBe(400);
	});

	test("delete removes it from list", async () => {
		const res = await post({
			path: "/sandboxes.delete",
			body: { id: created.id },
			key: masterKey,
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });

		expect(await listSandboxIds()).not.toContain(created.id);
	}, 120_000);
});
