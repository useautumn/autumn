import { describe, expect, test } from "bun:test";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import { fullCustomerToTags } from "./fullCustomerToTags";

// Svix rejects any message tag outside this set (or >128 chars) with HTTP 422,
// dropping the whole webhook. See shared/.../fullCustomerToTags.ts.
const SVIX_TAG_PATTERN = /^[a-zA-Z0-9\-_./\\#]+$/;
const SVIX_TAG_MAX_LENGTH = 128;

const cus = (id: string, entityId?: string): FullCustomer =>
	({
		id,
		internal_id: `internal_${id}`,
		entity: entityId ? { id: entityId } : undefined,
	}) as unknown as FullCustomer;

const expectSvixSafe = (tags: string[]) => {
	for (const tag of tags) {
		expect(tag).toMatch(SVIX_TAG_PATTERN);
		expect(tag.length).toBeLessThanOrEqual(SVIX_TAG_MAX_LENGTH);
	}
};

describe("fullCustomerToTags", () => {
	test("colon-delimited ids (e.g. tana:org:...) produce Svix-valid tags", () => {
		const tags = fullCustomerToTags({
			fullCustomer: cus(
				"tana:org:01kt19mvwrfhekvvdjejmnhgpa",
				"tana:user-profile:01kj7w67nbcbn7hvh5jyaq0aan",
			),
		});
		expectSvixSafe(tags);
	});

	test("email ids (contain @) produce Svix-valid tags", () => {
		expectSvixSafe(
			fullCustomerToTags({ fullCustomer: cus("someone@gmail.com") }),
		);
	});

	test("ids longer than 128 chars are clamped", () => {
		expectSvixSafe(
			fullCustomerToTags({ fullCustomer: cus(`x:${"a".repeat(200)}`) }),
		);
	});

	test("svix-allowed special chars (/ # - _ .) are preserved", () => {
		const tags = fullCustomerToTags({
			fullCustomer: cus("org/team#1.2-3_x"),
		});
		expect(tags).toEqual(["customer_id.org/team#1.2-3_x"]);
	});

	test("clean ids are preserved unchanged", () => {
		const tags = fullCustomerToTags({
			fullCustomer: cus("cus_3Fq123", "ent_abc"),
		});
		expect(tags).toEqual(["customer_id.cus_3Fq123", "entity_id.ent_abc"]);
	});

	test("emits only customer_id when there is no entity", () => {
		expect(fullCustomerToTags({ fullCustomer: cus("cus_plain") })).toEqual([
			"customer_id.cus_plain",
		]);
	});
});
