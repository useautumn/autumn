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
	expect(markup).toContain("2 running");
	expect(markup).toContain("10</span> customers");
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

test("a waiting run pulses a full bar instead of a count fill", () => {
	const markup = renderToStaticMarkup(
		<MigrationRunProgress
			completed={0}
			running={0}
			total={0}
			expected={10}
			label="Waiting for pro-v3"
			active
			waiting
		/>,
	);
	expect(markup).toContain("Waiting for pro-v3");
	expect(markup).toContain("animate-pulse");
	expect(markup).toContain("width:100%");
});

test("the running slot holds its place when claims briefly drop to zero", () => {
	const between = renderToStaticMarkup(
		<MigrationRunProgress
			completed={35_000}
			running={0}
			total={35_000}
			expected={705_000}
			label="Migrating customers"
			active
		/>,
	);
	expect(between).toContain("running");
	expect(between).toContain("opacity-0");
});
