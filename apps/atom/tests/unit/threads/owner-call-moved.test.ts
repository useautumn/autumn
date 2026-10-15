/**
 * A check that reached the owner thread after its customer moved to another replica (n-stack rig matrix: a 500
 * internal_error "The customer moved to <peer>" on the public port, 0.7 s after the peer's /health turned 200).
 */
import { describe, expect, test } from "bun:test";
import { CustomerMovedError } from "../../../src/processor/ownership/customerMovedError.js";
import {
	errorToReply,
	replyToError,
} from "../../../src/threads/owners/ownerCallContract.js";

describe("an owner thread's CustomerMovedError on its way back to the thread that took the request", () => {
	test("rig red: is still a CustomerMovedError naming the owner, so the public port hops it instead of answering 500", () => {
		const reply = errorToReply({
			id: 1,
			error: new CustomerMovedError({ owner: "10.0.0.2" }),
		});
		if (reply.ok) throw new Error("an error reply");

		const error = replyToError({ ...reply, thread: 1 });

		expect(error).toBeInstanceOf(CustomerMovedError);
		expect((error as CustomerMovedError).owner).toBe("10.0.0.2");
	});
});
