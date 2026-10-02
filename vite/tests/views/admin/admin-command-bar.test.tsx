import { expect, test } from "bun:test";
import { Command } from "@autumn/ui";
import { renderToStaticMarkup } from "react-dom/server";
import {
	ADMIN_TABS,
	adminPageCommands,
} from "../../../src/views/admin/adminPages";
import { CommandRow } from "../../../src/views/command-bar/command-row";

const renderCommands = ({ isAdmin }: { isAdmin: boolean }) =>
	renderToStaticMarkup(
		<Command>
			{adminPageCommands({ isAdmin }).map((page) => (
				<CommandRow
					key={page.path}
					icon={page.icon}
					title={page.title}
					subtext={page.section}
					onSelect={() => {}}
				/>
			))}
		</Command>,
	);

test("an ordinary user gets no admin commands at all", () => {
	expect(adminPageCommands({ isAdmin: false })).toEqual([]);
	const html = renderCommands({ isAdmin: false });
	for (const title of ["Admin", "Organizations", "Shadow Atom"])
		expect(html).not.toContain(title);
});

test("staff get every admin tab, deep-linked by ?tab=, and the admin pages", () => {
	const paths = adminPageCommands({ isAdmin: true }).map(({ title, path }) => [
		title,
		path,
	]);

	expect(paths).toEqual([
		...ADMIN_TABS.map(({ id, label }) => [label, `/admin?tab=${id}`]),
		["Shadow Atom", "/admin/shadow-atom"],
		["Balance worker rollout", "/admin/edge-config"],
		["OAuth Clients", "/admin/oauth"],
	]);
	const html = renderCommands({ isAdmin: true });
	for (const title of ["Organizations", "Caches", "Shadow Atom"])
		expect(html).toContain(title);
});
