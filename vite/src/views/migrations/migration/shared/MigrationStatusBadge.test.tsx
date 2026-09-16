import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MigrationStatusBadge } from "./MigrationStatusBadge";

const render = (props: Parameters<typeof MigrationStatusBadge>[0]) =>
	renderToStaticMarkup(<MigrationStatusBadge {...props} />);

test("running and waiting badges carry the live dot", () => {
	const running = render({ status: "running", blockedBy: null });
	expect(running).toContain("Running");
	expect(running).toContain("animate-ping");

	const waiting = render({ status: "waiting", blockedBy: "pro-v3" });
	expect(waiting).toContain("Waiting on pro-v3");
	expect(waiting).toContain("animate-ping");
});

test("draft and run badges are static", () => {
	expect(render({ status: "draft", blockedBy: null })).toContain("Draft");
	expect(render({ status: "draft", blockedBy: null })).not.toContain(
		"animate-ping",
	);
	expect(render({ status: "run", blockedBy: null })).toContain(">Run<");
});
