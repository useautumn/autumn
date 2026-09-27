import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	endpointReceivesEvent,
	endpointsSubscribeToEvent,
	filterEventTypesSubscribed,
	svixConfigToAppId,
} from "../../src/svix.js";

const listeningTo = (filterTypes: string[]) => ({ filterTypes });

describe("which events an endpoint receives", () => {
	test("no filter types means every event", () => {
		expect(
			endpointReceivesEvent({ endpoint: listeningTo([]), eventType: "a" }),
		).toBe(true);
	});

	test("with filter types, only those", () => {
		const endpoint = listeningTo(["balances.limit_reached"]);
		expect(
			endpointReceivesEvent({ endpoint, eventType: "balances.limit_reached" }),
		).toBe(true);
		expect(
			endpointReceivesEvent({ endpoint, eventType: "customer.created" }),
		).toBe(false);
	});

	test("an app subscribes when any endpoint listens", () => {
		const endpoints = [listeningTo(["x"]), listeningTo(["y"])];
		expect(endpointsSubscribeToEvent({ endpoints, eventType: "y" })).toBe(true);
		expect(endpointsSubscribeToEvent({ endpoints, eventType: "z" })).toBe(
			false,
		);
		expect(endpointsSubscribeToEvent({ endpoints: [], eventType: "x" })).toBe(
			false,
		);
	});

	test("keeps the event types some endpoint listens for, in the order asked", () => {
		expect(
			filterEventTypesSubscribed({
				endpoints: [listeningTo(["b"]), listeningTo([])],
				eventTypes: ["a", "b", "c"],
			}),
		).toEqual(["a", "b", "c"]);
		expect(
			filterEventTypesSubscribed({
				endpoints: [listeningTo(["b"])],
				eventTypes: ["a", "b", "c"],
			}),
		).toEqual(["b"]);
	});
});

describe("the app an org delivers through", () => {
	const svixConfig = { sandbox_app_id: "app_sandbox", live_app_id: "app_live" };

	test("is the env's app", () => {
		expect(svixConfigToAppId({ svixConfig, env: AppEnv.Live })).toBe(
			"app_live",
		);
		expect(svixConfigToAppId({ svixConfig, env: AppEnv.Sandbox })).toBe(
			"app_sandbox",
		);
	});

	test("is null when the org has none set up, or the config is blank", () => {
		expect(
			svixConfigToAppId({ svixConfig: null, env: AppEnv.Live }),
		).toBeNull();
		expect(
			svixConfigToAppId({ svixConfig: { live_app_id: "" }, env: AppEnv.Live }),
		).toBeNull();
	});
});
