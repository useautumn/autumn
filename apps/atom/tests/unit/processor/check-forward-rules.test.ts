import { describe, expect, test } from "bun:test";
import type { ForwardReason } from "../../../src/lib/forward/cannotAnswerError.js";
import {
	checkForwardReason,
	checkRequestToAnswerableCheck,
} from "../../../src/processor/actions/check/checkForwardRules.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import {
	checkRequestFor,
	forwardReasonOf,
	latestApiVersion,
} from "../utils/atomFixtures.js";

/** One request per reason Atom leaves a check to the API. */
const forwardedRequests: [ForwardReason, CheckRequest][] = [
	["no_api_version", checkRequestFor({ apiVersion: null })],
	[
		"product_check",
		checkRequestFor({ params: { feature_id: undefined, product_id: "pro" } }),
	],
	["send_event", checkRequestFor({ params: { send_event: true } })],
	[
		"lock",
		checkRequestFor({ params: { lock: { enabled: true, lock_id: "lock_1" } } }),
	],
	["with_preview", checkRequestFor({ params: { with_preview: true } })],
	["entity", checkRequestFor({ params: { entity_id: "seat_1" } })],
	[
		"customer_data",
		checkRequestFor({ params: { customer_data: { name: "Ada" } } }),
	],
	[
		"customer_data",
		checkRequestFor({
			params: { entity_data: { feature_id: "seats", name: "Seat 1" } },
		}),
	],
	["skip_cache", checkRequestFor({ query: { skip_cache: true } })],
];

describe("which checks Atom answers itself", () => {
	test.each(forwardedRequests)("%s goes to the API", (reason, request) => {
		expect(checkForwardReason({ request })).toBe(reason);
		expect(
			forwardReasonOf(() => checkRequestToAnswerableCheck({ request })),
		).toBe(reason);
	});

	test("a plain feature check is Atom's, with the balance it needs defaulting to 1", () => {
		const request = checkRequestFor();

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request })).toEqual({
			requestId: "req_check_1",
			occurredAt: expect.any(Number),
			customerId: "cus_1",
			featureId: "messages",
			requiredBalance: 1,
			properties: null,
			query: {},
			apiVersion: latestApiVersion,
		});
	});

	test("the older name for the required balance is still read", () => {
		const check = checkRequestToAnswerableCheck({
			request: checkRequestFor({ params: { required_quantity: 7 } }),
		});

		expect(check.requiredBalance).toBe(7);
	});

	test("flags that are sent but off do not rule Atom out", () => {
		const request = checkRequestFor({
			params: { send_event: false, with_preview: false },
			query: { skip_cache: false },
		});

		expect(checkForwardReason({ request })).toBeNull();
	});
});
