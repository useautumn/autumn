import { describe, expect, test } from "bun:test";
import { createPeerResolver } from "../../../src/replication/discovery/createPeerResolver.js";

const resolverOf = ({
	addresses,
	own = ["10.0.0.1"],
}: {
	addresses: string[] | Error;
	own?: string[];
}) => {
	let now = 0;
	let resolutions = 0;
	const resolver = createPeerResolver({
		ctx: {
			resolve: async () => {
				resolutions++;
				if (addresses instanceof Error) throw addresses;
				return addresses;
			},
			own: () => own,
			now: () => now,
		},
	});
	return {
		resolver,
		resolutions: () => resolutions,
		advance: (ms: number) => {
			now += ms;
		},
	};
};

describe("the peers a replica relays to", () => {
	test("are every address the service resolves to but this replica's own", async () => {
		const { resolver } = resolverOf({
			addresses: ["10.0.0.1", "10.0.0.2", "10.0.0.3"],
		});

		expect(await resolver.peers()).toEqual(["10.0.0.2", "10.0.0.3"]);
	});

	test("are none while the service does not resolve: a replica run alone relays nowhere", async () => {
		const { resolver } = resolverOf({ addresses: new Error("ENOTFOUND") });

		expect(await resolver.peers()).toEqual([]);
	});

	test("are resolved once and kept, then resolved again when forgotten or once the hold passes", async () => {
		const { resolver, resolutions, advance } = resolverOf({
			addresses: ["10.0.0.2"],
		});

		await Promise.all([resolver.peers(), resolver.peers()]);
		expect(resolutions()).toBe(1);

		await resolver.peers();
		expect(resolutions()).toBe(1);

		resolver.forget();
		await resolver.peers();
		expect(resolutions()).toBe(2);

		advance(5_001);
		await resolver.peers();
		expect(resolutions()).toBe(3);
	});
});
