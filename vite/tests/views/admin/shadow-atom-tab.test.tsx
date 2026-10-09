import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShadowAtomCreate } from "../../../src/views/admin/shadow-atom/ShadowAtomCreate";
import { ShadowAtomOrgTable } from "../../../src/views/admin/shadow-atom/ShadowAtomOrgTable";
import type {
	ShadowAtomConfigView,
	ShadowAtomNames,
} from "../../../src/views/admin/shadow-atom/shadowAtomTypes";
import type { AtomActions } from "../../../src/views/settings/sections/components/atom/useAtomActions";

const noop = () => {};
const added = async () => true;
const names: ShadowAtomNames = {
	orgsById: {
		org_test_1: { id: "org_test_1", name: "Example Org", slug: "example-org" },
	},
};

const envView = (
	overrides: Partial<ShadowAtomConfigView> = {},
): ShadowAtomConfigView => ({
	endpointUrl: null,
	hasAdminToken: false,
	orgs: {},
	...overrides,
});

const ready = (orgs: ShadowAtomConfigView["orgs"]) =>
	envView({
		endpointUrl: "https://shadow-atom.example.com",
		hasAdminToken: true,
		orgs,
	});

describe("shadow Atom with nothing deployed", () => {
	test("offers the org Atom's machine sizes and a create", () => {
		const actions = {
			create: { isPending: false },
			startSetup: async () => {},
		} as unknown as AtomActions;

		const html = renderToStaticMarkup(<ShadowAtomCreate actions={actions} />);

		expect(html).toContain("Medium");
		expect(html).toContain("RECOMMENDED");
		expect(html).toContain("Create shadow Atom");
	});
});

const renderOrgs = ({
	envConfig,
	issued = null,
}: {
	envConfig: ShadowAtomConfigView;
	issued?: {
		orgId: string;
		tokens: Record<"sandbox" | "live", string>;
	} | null;
}) =>
	renderToStaticMarkup(
		<ShadowAtomOrgTable
			config={envConfig}
			names={names}
			issued={issued}
			onAdd={added}
			onSetPercent={noop}
			onRemove={noop}
			isAdding={false}
			isBusy={false}
		/>,
	);

describe("orgs on the shadow Atom", () => {
	test("without an endpoint and admin token, adding is disabled and says why", () => {
		const html = renderOrgs({ envConfig: envView() });

		expect(html).toContain("No org is on the shadow Atom.");
		expect(html).toContain("Adding and changing orgs need a ready shadow Atom");
		expect(html).toMatch(
			/<button type="submit"[^>]* disabled=""[^>]*><span[^>]*>Add org</,
		);
	});

	test("the add form picks an org by name or slug and starts at 100%", () => {
		const html = renderOrgs({ envConfig: ready({}) });

		expect(html).toContain("Search orgs by name or slug");
		expect(html).toMatch(/aria-label="Percent" value="100"/);
		expect(html).not.toContain("Adding and changing orgs need");
	});

	test("each org shows name · slug, its percent in place, and whether it is pushing", () => {
		const html = renderOrgs({
			envConfig: ready({
				org_test_1: { registeredAt: 1, percent: 40 },
				org_test_2: { registeredAt: 2, percent: 0 },
			}),
			issued: {
				orgId: "org_test_1",
				tokens: { sandbox: "atom_sandbox_example", live: "atom_live_example" },
			},
		});

		expect(html).toContain("Example Org");
		expect(html).toContain("example-org");
		expect(html).toMatch(/aria-label="Percent for Example Org" value="40"/);
		expect(html).toContain("Pushing");
		expect(html).toMatch(/aria-label="Percent for org_test_2" value="0"/);
		expect(html).toContain("Registered");
		expect(html).toContain("Remove Example Org");
		expect(html).toContain("Sandbox token for Example Org");
		expect(html).toContain("Live token for Example Org");
		expect(html).toContain("atom_sandbox_example");
		expect(html).toContain("atom_live_example");
	});

	test("no env percent, customer pins or settle window are shown", () => {
		const html = renderOrgs({
			envConfig: ready({ org_test_1: { registeredAt: 1, percent: 40 } }),
		});

		for (const gone of ["Pinned", "customer", "settle", "Every org follows"])
			expect(html).not.toContain(gone);
	});
});

test("the page's tabs are the Atom and its orgs, with no Sandbox/Live switch: one shadow Atom serves both envs", async () => {
	const source = await Bun.file(
		new URL(
			"../../../src/views/admin/shadow-atom/ShadowAtomTab.tsx",
			import.meta.url,
		),
	).text();

	expect(source).toMatch(/SHADOW_ATOM_TABS = \["atom", "orgs"\]/);
	expect(source).not.toContain("shadow_env");
});
