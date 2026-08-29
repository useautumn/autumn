import { describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	type ChatApproval,
	type ChatApprovalWrite,
} from "@autumn/shared";
import { previewMoneyFactsDrifted } from "../../../src/internal/approvals/utils/previewMoneyFacts.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const CYCLE_START = Date.UTC(2026, 7, 22);
const CYCLE_END = Date.UTC(2026, 8, 22);
const MONTHLY_PRICE = 1900;

const roundToCents = (amount: number) => Math.round(amount * 100) / 100;

// A prorated in-advance line the way the server computes it: the period
// starts at server-now, so the amount decays with every re-preview.
const previewComputedAt = (nowMs: number) => {
	const prorated = roundToCents(
		(MONTHLY_PRICE * (CYCLE_END - nowMs)) / (CYCLE_END - CYCLE_START),
	);
	return {
		object: "billing_preview",
		customer_id: "rsd-customer-0001",
		currency: "usd",
		line_items: [
			{
				object: "billing_preview_line_item",
				custom: false,
				display_name: "Marketing Starter 150K",
				description: "Marketing Starter 150K - Base Price (prorated)",
				subtotal: prorated,
				total: prorated,
				discounts: [],
				plan_id: "marketing_starter_150k",
				feature_id: null,
				quantity: 1,
				period: { start: nowMs, end: CYCLE_END },
			},
		],
		subtotal: prorated,
		total: prorated,
		incoming: [{ plan_id: "marketing_starter_150k" }],
		outgoing: [],
	};
};

const CARD_SHOWN_AT = CYCLE_START + 9 * 24 * 60 * 60 * 1000;

describe("proration time-decay is not drift", () => {
	test("the same write re-previewed later does not drift", () => {
		expect(
			previewMoneyFactsDrifted({
				current: previewComputedAt(CARD_SHOWN_AT + 2 * 60 * 1000),
				stored: previewComputedAt(CARD_SHOWN_AT),
			}),
		).toEqual({ drifted: false });
	});

	test("the drift-refresh loop converges: a refreshed card is approvable", () => {
		let stored = previewComputedAt(CARD_SHOWN_AT);
		let clickedAt = CARD_SHOWN_AT;
		for (const secondsLater of [120, 30, 30]) {
			clickedAt += secondsLater * 1000;
			const current = previewComputedAt(clickedAt);
			const verdict = previewMoneyFactsDrifted({ current, stored });
			if (!verdict.drifted) return;
			stored = current;
		}
		throw new Error(
			"Approve never executed: every retry re-previewed a freshly decayed total",
		);
	});
});

let serverNow = CARD_SHOWN_AT;
let storedWrite: ChatApprovalWrite;
const releases: string[] = [];

await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: {
			debug: () => {},
			error: () => {},
			info: () => {},
			warn: () => {},
		},
	}),
});
await mockLeafModule({
	specifier:
		"../../../src/internal/installations/actions/getOrgInstallationToken.js",
	factory: () => ({
		getOrgInstallationToken: async () => ({ accessToken: "tok" }),
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			release: async () => {
				releases.push(storedWrite.approval_id);
			},
			setPreview: async () => {},
		},
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalWritesRepo.js",
	factory: () => ({
		chatApprovalWritesRepo: {
			list: async () => [storedWrite],
			setPreview: async ({ preview }: { preview: unknown }) => {
				storedWrite = { ...storedWrite, preview };
			},
		},
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/utils/fetchApprovalPreview.js",
	factory: () => ({
		withWritePreviews: async () => [{ preview: previewComputedAt(serverNow) }],
	}),
});

const { guardApprovalDrift } = await import(
	"../../../src/internal/approvals/actions/guardApprovalDrift.js"
);

const approval = {
	env: AppEnv.Sandbox,
	id: "ap_rsd_1",
	org_id: "org_rsd",
	provider: "slack",
	workspace_id: "T_RSD",
} as ChatApproval;

const parkCard = () => {
	serverNow = CARD_SHOWN_AT;
	releases.length = 0;
	storedWrite = {
		approval_id: approval.id,
		created_at: CARD_SHOWN_AT,
		deny_option_id: null,
		id: "wr_rsd_1",
		position: 0,
		preview: previewComputedAt(CARD_SHOWN_AT),
		request_id: "tc_rsd_1",
		result: null,
		status: "pending",
		tool_args: { customer_id: "rsd-customer-0001" },
		tool_name: "attach",
		updated_at: CARD_SHOWN_AT,
	} as ChatApprovalWrite;
};

describe("guardApprovalDrift under proration time-decay", () => {
	test("an untouched write approved minutes later executes", async () => {
		parkCard();
		serverNow = CARD_SHOWN_AT + 2 * 60 * 1000;
		const result = await guardApprovalDrift({
			approval,
			providerUserId: "U_RSD",
		});
		expect(result).toBeUndefined();
		expect(releases).toEqual([]);
	});

	test("retrying after a drift refresh eventually executes", async () => {
		parkCard();
		for (const secondsLater of [120, 30, 30]) {
			serverNow += secondsLater * 1000;
			const result = await guardApprovalDrift({
				approval,
				providerUserId: "U_RSD",
			});
			if (result === undefined) return;
		}
		throw new Error(
			"Approve never executed: every retry re-previewed a freshly decayed total",
		);
	});
});
