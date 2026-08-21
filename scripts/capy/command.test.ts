import { describe, expect, test } from "bun:test";
import { capyHandoffText } from "./command.ts";

describe("capyHandoffText", () => {
	test("describes the bounded Capy handoff", () => {
		const text = capyHandoffText();
		expect(text).toContain("tmux session: capy");
		expect(text).toContain("browser API uses /__autumn_api");
		expect(text).toContain("expose only port 3000");
	});
});
