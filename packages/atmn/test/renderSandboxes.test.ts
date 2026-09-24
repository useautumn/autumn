/** A sandbox name comes from the server and reaches the terminal verbatim, so
 * an escape sequence in one could repaint the table around it. */

import { expect, test } from "bun:test";
import chalk from "chalk";
import {
	renderSandboxes,
	type SandboxRow,
} from "../src/render/renderSandboxes";
import { stripTerminalControls } from "../src/render/stripTerminalControls";

chalk.level = 0;

const row = ({ name }: { name: string }): SandboxRow => ({
	id: "org_2n4b",
	name,
	slug: "staging-abc123|org_root",
	createdAt: 0,
	color: "gray",
	icon: "Flask",
});

test("an OSC sequence in a name never reaches the terminal", () => {
	const name = "\u001b]0;pwned\u0007staging";
	const out = renderSandboxes({
		sandboxes: [row({ name })],
		now: 0,
	});

	expect(out).not.toContain("\u001b");
	expect(out).not.toContain("\u0007");
	// The payload goes with the sequence: only the real name is left.
	expect(out).toContain("staging");
	expect(out).not.toContain("pwned");
});

test("CSI colour codes and bare control characters go too", () => {
	expect(stripTerminalControls("\u001b[31mred\u001b[0m")).toBe("red");
	expect(stripTerminalControls("a\u000db\u007fc\u009bd")).toBe("abcd");
	expect(stripTerminalControls("plain name")).toBe("plain name");
});

test("the row keeps its width from the stripped name", () => {
	const out = renderSandboxes({
		sandboxes: [row({ name: "\u001b[31mstaging\u001b[0m" })],
		now: 0,
	});

	expect(out.split("\n")[1]).toBe("org_2n4b  staging  just now");
});
