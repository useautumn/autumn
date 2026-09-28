import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MigrationStatusBadge } from "./MigrationStatusBadge";

const render = (props: Parameters<typeof MigrationStatusBadge>[0]) =>
	renderToStaticMarkup(<MigrationStatusBadge {...props} />);

test("each status renders its label with an icon carrying its own tone", () => {
	const running = render({ status: "running", blockedBy: null });
	expect(running).toContain("Running");
	expect(running).toContain("bg-green-500");

	const waiting = render({ status: "waiting", blockedBy: "pro-v3" });
	expect(waiting).toContain("Waiting on pro-v3");
	expect(waiting).toContain("bg-yellow-500");

	expect(render({ status: "run", blockedBy: null })).toContain("bg-blue-500");
	expect(render({ status: "draft", blockedBy: null })).toContain("Draft");
	for (const status of ["draft", "waiting", "running", "run"] as const) {
		expect(render({ status, blockedBy: null })).toContain("<svg");
	}
});

test("status label text stays neutral", () => {
	expect(render({ status: "failed", blockedBy: null })).not.toContain(
		"text-red-500",
	);
});
