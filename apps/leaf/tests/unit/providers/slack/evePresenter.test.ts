import { describe, expect, test } from "bun:test";
import { createEveSlackPresenter } from "../../../../src/providers/slack/evePresenter.js";

const presentReasoning = (text: string) => {
	let status = "";
	const presenter = createEveSlackPresenter({
		setStatus: (message) => {
			status = message;
		},
	});
	presenter.onReasoning({ id: "r1", text });
	return status;
};

describe("Slack reasoning status snippet", () => {
	test("long text shows the start, broken on a word, with a trailing ellipsis", () => {
		const text = `Attaching the scale plan to mx-mt1tnnjp-c2-2 with 5M emails included ${"and then some extra detail ".repeat(8)}`;
		const status = presentReasoning(text);

		expect(status.startsWith("Attaching the scale plan")).toBe(true);
		expect(status.startsWith("…")).toBe(false);
		expect(status.endsWith("…")).toBe(true);

		const body = status.slice(0, -1);
		expect(text.startsWith(body)).toBe(true);
		expect(text.charAt(body.length)).toBe(" ");
	});

	test("short text passes through untouched", () => {
		expect(presentReasoning("Previewing the attach")).toBe(
			"Previewing the attach",
		);
	});
});
