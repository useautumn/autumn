import { expect, test } from "bun:test";
import type { Row } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import { MigrationStatusCell, StatusCard } from "./cells/MigrationStatusCell";
import { createMigrationListColumns } from "./MigrationListColumns";
import { fixtureRows } from "./preview/migrationListFixtures";
import type { MigrationListRow } from "./rowView/deriveMigrationRowView";

const renderCell = ({ id, header }: { id: string; header: string }) => {
	const row = fixtureRows.find((candidate) => candidate.id === id);
	const column = createMigrationListColumns().find(
		(candidate) => candidate.header === header,
	);
	if (!row || !column || typeof column.cell !== "function")
		throw new Error(`${header} cell for ${id} missing`);
	const cell = column.cell({
		row: { original: row } as Row<MigrationListRow>,
	} as Parameters<typeof column.cell>[0]);
	return renderToStaticMarkup(cell)
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
};

test("list cells render the derived filter, operations and status text", () => {
	const id = "migration-starter-v2";
	expect(renderCell({ id, header: "Filter" })).toBe("Starter +1");
	expect(renderCell({ id, header: "Operations" })).toBe(
		"Starter → v2 Base price $39 → $49/mo +2",
	);
	expect(renderCell({ id, header: "Status" })).toBe("Failed at 80%");
	expect(renderCell({ id: "migration-a7k", header: "Filter" })).toBe(
		"No filter",
	);
});

const firstIcon = (markup: string) => markup.match(/<svg[\s\S]*?<\/svg>/)?.[0];

test("the status card badge draws the same icon as the row badge", () => {
	const row = fixtureRows.find(
		(candidate) => candidate.id === "migration-plan-variants",
	);
	if (!row) throw new Error("plan variants fixture missing");
	const rowIcon = firstIcon(
		renderToStaticMarkup(<MigrationStatusCell view={row.view} />),
	);
	const cardIcon = firstIcon(
		renderToStaticMarkup(<StatusCard status={row.view.status} />),
	);
	expect(rowIcon).toBeDefined();
	expect(cardIcon).toBe(rowIcon);
});
