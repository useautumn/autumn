import { expect, test } from "bun:test";
import { publishedSkillName } from "./publishedSkillName.js";

test("prefixes a short skill name", () => {
	expect(publishedSkillName({ name: "setup" })).toBe("autumn-setup");
});

test("does not double-prefix", () => {
	expect(publishedSkillName({ name: "autumn-catalog" })).toBe(
		"autumn-catalog",
	);
});
