import { describe, expect, mock, test } from "bun:test";
import {
	type ApiByocCache,
	AppEnv,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";

let firstCheckSeenAt: number | null = null;
mock.module("@/hooks/queries/useAtomChecksQuery", () => ({
	useAtomChecksQuery: () => ({ firstCheckSeenAt, checks: [] }),
}));
mock.module("@/contexts/ThemeProvider", () => ({
	useTheme: () => ({ isDark: true }),
}));

const { AtomVerifySection } = await import(
	"../../../src/views/settings/sections/components/atom/AtomVerifySection"
);

const { Done, Pending } = ByocCacheStageStatus;

const atom = ({ connected }: { connected: boolean }): ApiByocCache => ({
	id: "atom_1",
	env: AppEnv.Sandbox,
	name: "US East",
	stack_name: "atom-example-sandbox-abc123",
	status: ByocCacheStatus.Ready,
	deployment_id: "dep_1",
	endpoint_url: "https://atom.example.com",
	created_at: 0,
	first_check_at: null,
	cpu: 4,
	memory: 8,
	region: "us-east-1",
	volume_size_gib: 20,
	network: null,
	stages: {
		stack: Done,
		disk: Done,
		machine: Done,
		load_balancer: Done,
		atom: Done,
		connected: connected ? Done : Pending,
	},
	error: null,
});

/** The Finish setup button's markup in the Verify step for `cache`. */
const finishButton = (cache: ApiByocCache) => {
	const html = renderToStaticMarkup(
		<AtomVerifySection
			cache={cache}
			onDelete={() => {}}
			onFinish={() => {}}
			isFinishing={false}
		/>,
	);
	const button = html.match(
		/<button[^>]*>(?:(?!<\/button>).)*Finish setup/,
	)?.[0];
	if (!button) throw new Error("no Finish setup button");
	return { html, button };
};

describe("finishing an Atom's setup", () => {
	test("a connected Atom can finish setup while it still waits for its first check", () => {
		firstCheckSeenAt = null;
		const { html, button } = finishButton(atom({ connected: true }));
		expect(html).toContain("Waiting for a check");
		expect(button).not.toContain(' disabled=""');
	});

	test("an Atom Autumn hasn't reached yet can't finish setup", () => {
		firstCheckSeenAt = null;
		const { button } = finishButton(atom({ connected: false }));
		expect(button).toContain(' disabled=""');
	});
});
