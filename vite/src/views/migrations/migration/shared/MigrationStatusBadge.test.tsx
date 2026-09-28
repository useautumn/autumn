import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MigrationStatusBadge } from "./MigrationStatusBadge";

const render = (props: Parameters<typeof MigrationStatusBadge>[0]) =>
	renderToStaticMarkup(<MigrationStatusBadge {...props} />);

test("each status renders its label with a filled icon and its own tone", () => {
	const running = render({ status: "running", blockedBy: null });
	expect(running).toContain("Running");
	expect(running).toContain("#30A46C");

	const waiting = render({ status: "waiting", blockedBy: "pro-v3" });
	expect(waiting).toContain("Waiting on pro-v3");
	expect(waiting).toContain("#E2B93B");

	expect(render({ status: "run", blockedBy: null })).toContain("#3E8BD9");
	expect(render({ status: "draft", blockedBy: null })).toContain("Draft");
	for (const status of ["draft", "waiting", "running", "run"] as const) {
		expect(render({ status, blockedBy: null })).toContain("<svg");
	}
});
