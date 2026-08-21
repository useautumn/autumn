import { describe, expect, test } from "bun:test";
import { capyHandoffText } from "./command.ts";

describe("capyHandoffText", () => {
	test("describes the bounded Capy handoff", () => {
		const text = capyHandoffText();
		expect(text).toContain("tmux session: capy");
		expect(text).toContain("expose 8080 too");
		expect(text).toContain("google.emulate.localhost");
	});
});
