import { describe, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
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
	[
		"lock_version",
		checkRequestFor({
			params: { lock: { enabled: true, lock_id: "lock_1" } },
			apiVersion: new ApiVersionClass(ApiVersion.V2_5),
		}),
	],
	["with_preview", checkRequestFor({ params: { with_preview: true } })],
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
	test.each(forwardedRequests)(
		"%s goes to the API",
		async (reason, request) => {
			expect(checkForwardReason({ request })).toBe(reason);
			expect(
				await forwardReasonOf(() => checkRequestToAnswerableCheck({ request })),
			).toBe(reason);
		},
	);

	test("a plain feature check is Atom's, with the balance it needs defaulting to 1", () => {
		const request = checkRequestFor();

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request })).toEqual({
			requestId: "req_check_1",
			occurredAt: expect.any(Number),
			customerId: "cus_1",
			featureId: "messages",
			entityId: null,
			requiredBalance: 1,
			properties: null,
			lock: null,
			query: {},
			apiVersion: latestApiVersion,
		});
	});

	test("a customer's own lock at 2.6 is Atom's, and carries the lock it asked for", () => {
		const lock = {
			enabled: true as const,
			lock_id: "lock_1",
			expires_at: 1_800_000_000_000,
		};
		const request = checkRequestFor({ params: { lock } });

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request }).lock).toEqual(lock);
	});

	test("a customer's own send_event is Atom's", () => {
		const request = checkRequestFor({ params: { send_event: true } });

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request }).customerId).toBe("cus_1");
	});

	test("an entity's send_event is Atom's", () => {
		const request = checkRequestFor({
			params: { send_event: true, entity_id: "seat_1" },
		});

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request }).entityId).toBe("seat_1");
	});

	test("an entity's lock at 2.6 is Atom's, and carries the lock it asked for", () => {
		const lock = { enabled: true as const, lock_id: "lock_1" };
		const request = checkRequestFor({ params: { lock, entity_id: "seat_1" } });

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request })).toMatchObject({
			entityId: "seat_1",
			lock,
		});
	});

	test("a check on an entity is Atom's too", () => {
		const request = checkRequestFor({ params: { entity_id: "seat_1" } });

		expect(checkForwardReason({ request })).toBeNull();
		expect(checkRequestToAnswerableCheck({ request }).entityId).toBe("seat_1");
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
