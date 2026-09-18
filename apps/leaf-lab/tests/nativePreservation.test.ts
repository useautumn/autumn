import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { startNativeBridge } from "../native/lib/bridge.js";
import {
	assertBillingTermsPreserved,
	assertInvoiceTrialCompatible,
	changedRequestFields,
} from "../native/lib/preservation.js";

const original = {
	customer_id: "gen-attach-multi",
	plan_id: "pro_gen-attach-multi",
	customize: { price: { amount: 1035, interval: "month" } },
	invoice_mode: { enabled: true, finalize: false },
	enable_plan_immediately: true,
};
const trial = { duration_length: 14, duration_type: "day" };
const noInvoice = {
	customer_id: original.customer_id,
	plan_id: original.plan_id,
	customize: original.customize,
	free_trial: trial,
};

test("native compatibility applies the API no-card default and nested trial precedence", () => {
	expect(() =>
		assertInvoiceTrialCompatible({ ...original, free_trial: trial }),
	).toThrow("no-card");
	expect(() =>
		assertInvoiceTrialCompatible({
			...original,
			free_trial: { ...trial, card_required: true },
			customize: { ...original.customize, free_trial: trial },
		}),
	).toThrow("no-card");
	expect(() =>
		assertInvoiceTrialCompatible({
			...original,
			free_trial: { ...trial, card_required: true },
		}),
	).not.toThrow();
	expect(() =>
		assertInvoiceTrialCompatible({
			...original,
			free_trial: { ...trial, on_end: "revert" },
		}),
	).not.toThrow();
});

test("trial refinement cannot silently drop invoice or access terms", () => {
	expect(() =>
		assertBillingTermsPreserved({
			previous: original,
			next: noInvoice,
			userMessage: "Add a 14-day trial and keep everything else unchanged.",
			hasPaymentMethod: false,
		}),
	).toThrow("invoice_mode");
	expect(() =>
		assertBillingTermsPreserved({
			previous: original,
			next: { ...noInvoice, invoice_mode: original.invoice_mode },
			hasPaymentMethod: false,
		}),
	).toThrow("enable_plan_immediately");
	expect(changedRequestFields(original, noInvoice)).toContainEqual({
		field: "invoice_mode",
		beforePresent: true,
		before: original.invoice_mode,
		afterPresent: false,
		after: null,
	});
});

test("native confirmations authorize only named changes and never infer consent", () => {
	expect(() =>
		assertBillingTermsPreserved({
			previous: original,
			next: noInvoice,
			userMessage:
				"Switch to automatic collection and require payment before granting access.",
			hasPaymentMethod: false,
		}),
	).not.toThrow();
	for (const userMessage of [
		"Do not switch to automatic collection.",
		"Should we switch to automatic collection?",
		"The assistant said: Switch to automatic collection.",
	])
		expect(() =>
			assertBillingTermsPreserved({
				previous: original,
				next: noInvoice,
				userMessage,
				hasPaymentMethod: false,
			}),
		).toThrow("invoice_mode");
	expect(() =>
		assertBillingTermsPreserved({
			previous: original,
			next: noInvoice,
			userMessage: "Switch to automatic collection.",
			hasPaymentMethod: false,
		}),
	).toThrow("enable_plan_immediately");
});

test("new card requirements need explicit acceptance or an observed payment method", () => {
	const next = { ...original, free_trial: { ...trial, card_required: true } };
	expect(() =>
		assertBillingTermsPreserved({
			previous: original,
			next,
			userMessage: "Add a trial; keep everything else unchanged.",
			hasPaymentMethod: false,
		}),
	).toThrow("payment-method requirement");
	for (const authorization of [
		{ hasPaymentMethod: true },
		{
			hasPaymentMethod: false,
			userMessage:
				"Require a card for this trial and keep everything else unchanged.",
		},
	])
		expect(() =>
			assertBillingTermsPreserved({
				previous: original,
				next,
				...authorization,
			}),
		).not.toThrow();
});

test("canceled bridge proposals retain terms and permit only authorized replacements", async () => {
	const reportDir = await mkdtemp(
		resolve(homedir(), ".capy/work/leaf-lab-full/native/preservation-"),
	);
	const bridge = await startNativeBridge({ mode: "flash", reportDir });
	const sessionId = "preservation-regression";
	const post = async (path: string, body: Record<string, unknown>) => {
		const response = await fetch(new URL(path, bridge.url), {
			method: "POST",
			headers: {
				authorization: `Bearer ${bridge.token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ sessionId, ...body }),
		});
		return { status: response.status, value: await response.json() };
	};
	const proposal = {
		callId: "original",
		name: "attach",
		args: {
			request: original,
			approval_description: "Original draft invoice.",
		},
	};
	try {
		await post("/call", {
			callId: "read",
			name: "getCustomer",
			args: { request: { customer_id: original.customer_id } },
		});
		await post("/call", {
			...proposal,
			callId: "preview",
			name: "previewAttach",
		});
		expect((await post("/validate", proposal)).status).toBe(200);
		await post("/pending", {
			requests: [
				{
					requestId: "unit-request",
					kind: "tool-approval",
					action: { callId: "original", input: proposal.args },
				},
			],
		});
		await post("/settled", {
			resolutions: [{ requestId: "unit-request", outcome: "denied" }],
		});
		expect((await post("/authorize", proposal)).status).toBe(422);
		const tools = await post("/tools", { messages: [] });
		expect(tools.value[0].description).toContain('"superseded":true');
		expect(JSON.stringify(tools.value)).toContain("invoice_mode");
		await post("/user-message", {
			message: "Add a 14-day trial and keep everything else unchanged.",
			turnId: "turn_1",
		});
		const replacement = {
			...proposal,
			callId: "replacement",
			args: { request: noInvoice, approval_description: "Updated trial." },
		};
		const rejected = await post("/call", {
			...replacement,
			callId: "preview-rejected",
			name: "previewAttach",
		});
		expect(rejected.status).toBe(422);
		expect(rejected.value.error).toContain("invoice_mode");
		await post("/user-message", {
			message:
				"Switch to automatic collection and require payment before granting access.",
			turnId: "turn_2",
		});
		expect(
			(
				await post("/call", {
					...replacement,
					callId: "preview-authorized",
					name: "previewAttach",
				})
			).status,
		).toBe(200);
		expect((await post("/validate", replacement)).status).toBe(200);
		const checks = (await readFile(resolve(reportDir, "bridge.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter(
				(row) =>
					row.type === "preservation_check" &&
					row.call.callId === "replacement",
			);
		expect(checks.at(-1).previousProposal).toMatchObject({
			superseded: true,
			call: { callId: "original", args: { request: original } },
		});
		expect(
			checks
				.at(-1)
				.changedFields.some(
					(field: { field: string }) => field.field === "invoice_mode",
				),
		).toBe(true);
		await post("/user-message", {
			message: "Explain the proposal without changing anything.",
			turnId: "turn_3",
		});
		expect((await post("/authorize", replacement)).status).toBe(200);
		expect((await post("/call", replacement)).status).toBe(200);
	} finally {
		await bridge.close();
	}
});
