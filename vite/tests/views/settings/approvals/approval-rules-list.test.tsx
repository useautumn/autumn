/**
 * Contract: the Approvals list says when rules failed to load, labels live rules
 * in sandbox, never claims owners or admins are exempt, numbers each rule by its
 * order, and only lets owners and admins flip a rule's switch.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRule } from "@autumn/shared";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalRuleRow } from "@/views/settings/sections/approvals/ApprovalRuleRow";
import { ApprovalRulesList } from "@/views/settings/sections/approvals/ApprovalRulesList";
import { RuleRowMenu } from "@/views/settings/sections/approvals/RuleRowMenu";

const renderList = ({
	error = null,
	isSandbox = false,
}: {
	error?: Error | null;
	isSandbox?: boolean;
}) =>
	renderToStaticMarkup(
		<ApprovalRulesList
			rules={[]}
			error={error}
			isSandbox={isSandbox}
			rowActions={{ canEdit: true, onOpen: () => {}, onDelete: () => {} }}
		/>,
	);

const rule: ApprovalRule = {
	id: "apr_1",
	name: "No billing",
	effect: "block",
	position: 1,
	subjects: [{ type: "everyone" }],
	actions: ["billing.attach"],
	filter: null,
	note: null,
	enabled: true,
	version: 1,
	updated_by: { user_id: "usr_1", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
};

const renderRow = ({
	canToggle,
	menu = null,
}: {
	canToggle: boolean;
	menu?: ReactNode;
}) =>
	renderToStaticMarkup(
		<table>
			<tbody>
				<ApprovalRuleRow
					rule={rule}
					parts={[]}
					order={2}
					enabled={true}
					canToggle={canToggle}
					onToggle={() => {}}
					menu={menu}
				/>
			</tbody>
		</table>,
	);

describe("approval rules list states", () => {
	test("a failed load shows an error, not the empty state", () => {
		const html = renderList({ error: new Error("boom") });
		expect(html).toContain("Couldn&#x27;t load rules");
		expect(html).not.toContain("No rules yet");
	});

	test("no rules shows the empty state", () => {
		expect(renderList({})).toContain("No rules yet");
	});

	test("sandbox says the rules shown are live", () => {
		expect(renderList({ isSandbox: true })).toContain(
			"These are your live rules. Sandbox is never restricted.",
		);
		expect(renderList({})).not.toContain("These are your live rules");
	});

	test("the notes say rules apply to owners and admins", () => {
		const html = renderList({});
		expect(html).toContain("owners and admins included");
		expect(html).toContain("the rule lower in the list wins");
		expect(html).not.toContain("never limited");
	});
});

describe("approval rule row", () => {
	test("rules show their position", () => {
		expect(renderRow({ canToggle: true })).toContain(">2</td>");
	});

	test("a member who isn't owner or admin sees the switch disabled", () => {
		expect(renderRow({ canToggle: false })).toContain("data-disabled");
		expect(renderRow({ canToggle: true })).not.toContain("data-disabled");
	});

	test("members who can't edit still get a menu to view the rule", () => {
		const menu = (
			<RuleRowMenu
				rule={rule}
				actions={{ canEdit: false, onOpen: () => {}, onDelete: () => {} }}
				isFirst={false}
				isLast={false}
				isMoving={false}
				onMove={() => {}}
			/>
		);
		expect(renderRow({ canToggle: false, menu })).toContain(
			'aria-label="No billing actions"',
		);
	});
});
