import { expect, test } from "bun:test";
import type { Row } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import type { MigrationWithRunInfo } from "@/hooks/queries/useMigrationsQuery";
import { createMigrationListColumns } from "./MigrationListColumns";

const renderStatusCell = (
	migration: Pick<MigrationWithRunInfo, "status" | "blocked_by">,
) => {
	const column = createMigrationListColumns().find(
		(candidate) => candidate.header === "Status",
	);
	if (!column || typeof column.cell !== "function")
		throw new Error("Status column missing");
	const cell = column.cell({
		row: { original: migration } as Row<MigrationWithRunInfo>,
	} as Parameters<typeof column.cell>[0]);
	return renderToStaticMarkup(cell);
};

test("the list status column renders the computed status", () => {
	expect(renderStatusCell({ status: "draft", blocked_by: null })).toContain(
		"Draft",
	);
	const waiting = renderStatusCell({ status: "waiting", blocked_by: "pro-v3" });
	expect(waiting).toContain(">Waiting<");
	expect(waiting).toContain('title="Waiting on pro-v3"');
	expect(renderStatusCell({ status: "run", blocked_by: null })).toContain(
		">Run<",
	);
});
