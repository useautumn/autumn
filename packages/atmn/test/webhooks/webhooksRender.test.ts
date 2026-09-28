/** The preview names an empty event list for what it is: every event. */

import { expect, test } from "bun:test";
import { renderWebhooks } from "../../src/render/renderWebhooks";

const state = (events: string[]) => ({
	id: "billing",
	url: "https://x.dev/h",
	description: null,
	events,
	disabled: false,
	createdAt: 1,
	updatedAt: 1,
});

test("an empty event list previews as every event, on create and on update", () => {
	const text = renderWebhooks({
		webhooks: {
			changes: [
				{ action: "create", id: "billing", webhook: state([]) },
				{
					action: "update",
					id: "audit",
					before: state(["billing.updated"]),
					after: state([]),
				},
			] as never,
		},
	});
	expect(text).toContain("events: every event");
	expect(text).toContain("events: billing.updated → every event");
	expect(text).not.toContain("(none)");
});
