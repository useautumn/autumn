import { describe, expect, test } from "bun:test";
import { ByocCacheStatus } from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { ShadowAtomDeploymentCard } from "../../../src/views/admin/shadow-atom/ShadowAtomDeploymentCard";
import { ShadowAtomOrgTable } from "../../../src/views/admin/shadow-atom/ShadowAtomOrgTable";
import type {
	ShadowAtomConfigView,
	ShadowAtomDeployment,
	ShadowAtomNames,
} from "../../../src/views/admin/shadow-atom/shadowAtomTypes";

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

const renderDeployment = ({
	deployment,
	created = null,
}: {
	deployment: ShadowAtomDeployment | null;
	created?: { adminTokenHash: string; setupUrl: string | null } | null;
}) =>
	renderToStaticMarkup(
		<ShadowAtomDeploymentCard
			deployment={deployment}
			created={created}
			onCreate={noop}
			onResize={noop}
			onDelete={noop}
			isCreating={false}
			isResizing={false}
			isDeleting={false}
			isBusy={false}
		/>,
	);

describe("shadow Atom deployment card", () => {
	test("with nothing deployed it offers Create and nothing to delete", () => {
		const html = renderDeployment({ deployment: null });

		expect(html).toContain("Not deployed");
		expect(html).toContain("Create");
		expect(html).not.toContain("Delete");
		expect(html).not.toContain("Resize");
	});

	test("right after create it shows the admin token hash once and the setup link", () => {
		const html = renderDeployment({
			deployment: {
				deployment_group_id: "dg_1",
				status: ByocCacheStatus.AwaitingSetup,
				endpoint_url: null,
				machine: null,
			},
			created: { adminTokenHash: "a1b2c3", setupUrl: "https://setup.example" },
		});

		expect(html).toContain("Awaiting setup");
		expect(html).toContain("a1b2c3");
		expect(html).toContain("Shown once");
		expect(html).toContain("https://setup.example");
		expect(html).toContain("Resize");
		expect(html).toContain("Delete");
	});

	test("a ready Atom shows its endpoint and machine, and no token", () => {
		const html = renderDeployment({
			deployment: {
				deployment_group_id: "dg_1",
				status: ByocCacheStatus.Ready,
				endpoint_url: "https://shadow-atom.example.com",
				machine: { cpu: 4, memory: 8 },
			},
		});

		expect(html).toContain("Ready");
		expect(html).toContain("https://shadow-atom.example.com");
		expect(html).toContain("4 vCPU · 8 GiB");
		expect(html).not.toContain("Admin token hash");
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

test("the page has no Sandbox/Live switch: one shadow Atom serves both envs", async () => {
	const source = await Bun.file(
		new URL(
			"../../../src/views/admin/shadow-atom/ShadowAtomTab.tsx",
			import.meta.url,
		),
	).text();

	expect(source).not.toContain("TabsTrigger");
	expect(source).not.toContain("shadow_env");
});
