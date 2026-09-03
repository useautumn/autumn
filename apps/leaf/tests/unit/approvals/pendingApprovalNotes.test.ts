import { describe, expect, test } from "bun:test";
import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import { pendingApprovalNotes } from "../../../src/internal/approvals/domain/pendingApprovalNotes.js";

// Newest first, as the repo returns them.
const approvals = [
	{
		id: "chat_app_newer",
		tool_args: {
			_eveApproveOptionId: "approve",
			approval_description: "Attach Pro to cus_2",
			request: { customer_id: "cus_2", plan_id: "pro" },
		},
		tool_call_id: "toolu_2",
		tool_name: "autumn__attach",
	},
	{
		id: "chat_app_older",
		tool_args: {
			_eveWithheldWrites: [
				{ input: { request: { customer_id: "legacy" } }, toolName: "legacy" },
			],
			approval_description: "Rename and upgrade cus_1",
			request: { customer_id: "cus_1", name: "Acme" },
		},
		tool_call_id: "toolu_1",
		tool_name: "autumn__updateCustomer",
	},
] as unknown as ChatApproval[];

const olderWrites = [
	{
		approval_id: "chat_app_older",
		position: 0,
		tool_args: { request: { customer_id: "cus_1", name: "Acme" } },
		tool_name: "updateCustomer",
	},
	{
		approval_id: "chat_app_older",
		position: 1,
		request_id: "toolu_1b",
		tool_args: {
			approval_description: "Rename and upgrade cus_1",
			request: { customer_id: "cus_1", plan_id: "startup" },
		},
		tool_name: "autumn__attach",
	},
] as unknown as ChatApprovalWrite[];

describe("pendingApprovalNotes", () => {
	test("lists each card oldest first with every write as its bare request body", () => {
		const notes = pendingApprovalNotes({
			approvals,
			writesByApprovalId: new Map([
				["chat_app_newer", []],
				["chat_app_older", olderWrites],
			]),
		});

		expect(notes).toEqual([
			{
				writes: [
					{
						request: { customer_id: "cus_1", name: "Acme" },
						toolName: "updateCustomer",
					},
					{
						request: { customer_id: "cus_1", plan_id: "startup" },
						toolName: "attach",
					},
				],
			},
			{
				writes: [
					{
						request: { customer_id: "cus_2", plan_id: "pro" },
						toolName: "attach",
					},
				],
			},
		]);
	});

	test("a flat request body without the MCP wrapper is echoed as-is", () => {
		const notes = pendingApprovalNotes({
			approvals: [
				{
					id: "chat_app_flat",
					tool_args: {
						approval_description: "Attach",
						customer_id: "cus_3",
						plan_id: "pro",
					},
					tool_name: "attach",
				},
			] as unknown as ChatApproval[],
			writesByApprovalId: new Map(),
		});

		expect(notes).toEqual([
			{
				writes: [
					{
						request: { customer_id: "cus_3", plan_id: "pro" },
						toolName: "attach",
					},
				],
			},
		]);
	});
});
