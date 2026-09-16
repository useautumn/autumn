import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MigrationRunProgress } from "./MigrationRunProgress";

test("an active run shows the count against the expected scope", () => {
	const markup = renderToStaticMarkup(
		<MigrationRunProgress
			completed={5}
			running={2}
			total={7}
			expected={10}
			label="Migrating customers"
			active
		/>,
	);
	expect(markup).toContain("Migrating customers");
	expect(markup).toContain("5 of 10 customers, 2 running");
	expect(markup).toContain("width:50%");
});

test("nothing renders once no run is active", () => {
	expect(
		renderToStaticMarkup(
			<MigrationRunProgress
				completed={5}
				running={0}
				total={5}
				expected={5}
				label="Last run"
				active={false}
			/>,
		),
	).toBe("");
});
