import { describe, expect, test } from "bun:test";
import { ByocCacheStatus } from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { ShadowAtomDeploymentCard } from "../../../src/views/admin/shadow-atom/ShadowAtomDeploymentCard";
import { ShadowAtomOrgList } from "../../../src/views/admin/shadow-atom/ShadowAtomOrgList";
import { ShadowAtomResultsTable } from "../../../src/views/admin/shadow-atom/ShadowAtomResultsTable";
import { ShadowAtomRolloutPanel } from "../../../src/views/admin/shadow-atom/ShadowAtomRolloutPanel";
import {
	toShadowAtomSettings,
	unpinCustomer,
} from "../../../src/views/admin/shadow-atom/shadowAtomRolloutEdits";
import type {
	ShadowAtomConfigView,
	ShadowAtomDeployment,
	ShadowAtomEnvView,
	ShadowAtomRollout,
} from "../../../src/views/admin/shadow-atom/shadowAtomTypes";

const noop = () => {};
const saved = async () => true;

const rollout = (
	overrides: Partial<ShadowAtomRollout> = {},
): ShadowAtomRollout => ({
	percent: 0,
	previousPercent: 0,
	changedAt: 0,
	orgs: {},
	customers: {},
	...overrides,
});

const envView = (
	overrides: Partial<ShadowAtomEnvView> = {},
): ShadowAtomEnvView => ({
	endpointUrl: null,
	rollout: rollout(),
	hasAdminToken: false,
	orgs: {},
	...overrides,
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
	envConfig: ShadowAtomEnvView;
	issued?: { orgId: string; token: string } | null;
}) =>
	renderToStaticMarkup(
		<ShadowAtomOrgList
			envConfig={envConfig}
			issued={issued}
			onRegister={saved}
			onUnregister={noop}
			isRegistering={false}
			isBusy={false}
		/>,
	);

describe("orgs on the shadow Atom", () => {
	test("without an endpoint and admin token, registering is disabled and says why", () => {
		const html = renderOrgs({ envConfig: envView() });

		expect(html).toContain("No org is on the shadow Atom.");
		expect(html).toContain(
			"Registering and unregistering need a ready shadow Atom",
		);
		expect(html).toMatch(
			/<button type="submit"[^>]* disabled=""[^>]*><span[^>]*>Register</,
		);
	});

	test("a registered org is listed and a fresh token shows once", () => {
		const html = renderOrgs({
			envConfig: envView({
				endpointUrl: "https://shadow-atom.example.com",
				hasAdminToken: true,
				orgs: { org_test_1: { registeredAt: Date.UTC(2026, 9, 2, 12, 0) } },
			}),
			issued: { orgId: "org_test_1", token: "atom_secret_example" },
		});

		expect(html).toContain("org_test_1");
		expect(html).toContain("atom_secret_example");
		expect(html).toContain("Shown once");
		expect(html).not.toContain("Registering and unregistering need");
	});
});

describe("shadow results", () => {
	test("a server without Axiom says so", () => {
		const html = renderToStaticMarkup(
			<ShadowAtomResultsTable
				results={{ available: false, range: "1h", orgs: [] }}
			/>,
		);

		expect(html).toContain("Axiom is not configured");
	});

	test("no lines in the window reads as empty", () => {
		const html = renderToStaticMarkup(
			<ShadowAtomResultsTable
				results={{ available: true, range: "24h", orgs: [] }}
			/>,
		);

		expect(html).toContain("No shadow checks in the last 24h.");
	});

	test("each org shows checks, match rate and p50/p99", () => {
		const html = renderToStaticMarkup(
			<ShadowAtomResultsTable
				results={{
					available: true,
					range: "1h",
					orgs: [
						{
							org_id: "org_test_1",
							checks: 1200,
							matches: 990,
							mismatches: 10,
							timeouts: 150,
							errors: 50,
							match_rate: 0.99,
							p50_ms: 3.4,
							p99_ms: 41.2,
						},
						{
							org_id: "org_test_2",
							checks: 3,
							matches: 0,
							mismatches: 0,
							timeouts: 3,
							errors: 0,
							match_rate: null,
							p50_ms: 300,
							p99_ms: 300,
						},
					],
				}}
			/>,
		);

		expect(html).toContain("org_test_1");
		expect(html).toContain("1,200");
		expect(html).toContain("99.00%");
		expect(html).toContain("3 ms");
		expect(html).toContain("41 ms");
		expect(html).toContain("150 / 50");
		expect(html).toContain("—");
	});
});

describe("rollout panel", () => {
	test("empty overrides and pins read as such", () => {
		const html = renderToStaticMarkup(
			<ShadowAtomRolloutPanel
				rollout={rollout()}
				onSave={saved}
				isSaving={false}
			/>,
		);

		expect(html).toContain("Every org follows the env&#x27;s percent.");
		expect(html).toContain("No customer is pinned.");
		expect(html).toContain("Never changed");
	});

	test("overrides and pins are listed with their values", () => {
		const html = renderToStaticMarkup(
			<ShadowAtomRolloutPanel
				rollout={rollout({
					percent: 10,
					changedAt: 1,
					orgs: { org_test_1: 50 },
					customers: { org_test_1: { cus_in: true, cus_out: false } },
				})}
				onSave={saved}
				isSaving={false}
			/>,
		);

		expect(html).toContain("50%");
		expect(html).toContain("org_test_1 / cus_in");
		expect(html).toContain("Pinned in");
		expect(html).toContain("Pinned out");
	});
});

describe("rollout edits", () => {
	const config: ShadowAtomConfigView = {
		sandbox: envView({ endpointUrl: "https://sandbox.example.com" }),
		live: envView({ rollout: rollout({ percent: 7 }) }),
	};

	test("a save sends both envs' address and rollout, replacing only this env's rollout", () => {
		const settings = toShadowAtomSettings({
			config,
			env: "sandbox",
			rollout: rollout({ percent: 25 }),
		});

		expect(settings).toEqual({
			sandbox: {
				endpointUrl: "https://sandbox.example.com",
				rollout: rollout({ percent: 25 }),
			},
			live: { endpointUrl: null, rollout: rollout({ percent: 7 }) },
		});
	});

	test("unpinning an org's last customer drops the org", () => {
		const next = unpinCustomer({
			rollout: rollout({
				customers: { org_a: { cus_1: true }, org_b: { cus_2: false } },
			}),
			orgId: "org_a",
			customerId: "cus_1",
		});

		expect(next.customers).toEqual({ org_b: { cus_2: false } });
	});
});
