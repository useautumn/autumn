import { afterAll, describe, expect, test } from "bun:test";
import { ShadowAtomConfigSchema } from "@autumn/edge-config";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import { sendCheckToAtom } from "@/internal/balances/check/atomShadow/sendCheckToAtom.js";

/** Holds every check open until released, so the test controls how many are in flight. */
const releases: (() => void)[] = [];
const atom = Bun.serve({
	port: 0,
	fetch: () =>
		new Promise<Response>((resolve) => {
			releases.push(() => resolve(Response.json({ allowed: true })));
		}),
});
afterAll(() => atom.stop(true));

const target = ({ maxInFlight }: { maxInFlight: number }) => ({
	endpointUrl: `http://localhost:${atom.port}`,
	token: "token",
	maxInFlight,
});

const send = ({ maxInFlight }: { maxInFlight: number }) =>
	sendCheckToAtom({
		target: target({ maxInFlight }),
		params: { customer_id: "cus_1", feature_id: "messages" },
		search: "",
		apiVersion: new ApiVersionClass(ApiVersion.V1_2),
	});

const waitForOpen = async ({ count }: { count: number }) => {
	while (releases.length < count) await Bun.sleep(5);
};

describe("shadow checks open per process", () => {
	test("the config defaults the cap to 16 and refuses one outside 1–1024", () => {
		expect(ShadowAtomConfigSchema.parse({}).checkMaxInFlight).toBe(16);
		expect(
			ShadowAtomConfigSchema.parse({ checkMaxInFlight: 256 }).checkMaxInFlight,
		).toBe(256);
		for (const checkMaxInFlight of [0, 1025, 2.5])
			expect(() =>
				ShadowAtomConfigSchema.parse({ checkMaxInFlight }),
			).toThrow();
	});

	test("a check past the target's cap is shed without dialling the Atom, and one under it is sent", async () => {
		const open = [send({ maxInFlight: 2 }), send({ maxInFlight: 2 })];
		await waitForOpen({ count: 2 });

		expect(await send({ maxInFlight: 2 })).toEqual({
			kind: "timeout",
			shed: true,
		});
		expect(releases).toHaveLength(2);

		const raised = send({ maxInFlight: 3 });
		await waitForOpen({ count: 3 });
		for (const release of releases.splice(0)) release();
		expect(await raised).toEqual({ kind: "answered", body: { allowed: true } });
		await Promise.all(open);
	});
});
