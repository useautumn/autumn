/**
 * Test-only principals: requests made *as* an org member with a built-in role.
 *
 * Contract:
 * - `s.member({ role })` adds a fresh member of the scenario org with that role,
 *   returned in `members` in call order.
 * - `autumnAs(member)` sends requests with that member's dashboard session, so
 *   they get the role's scopes, not the org secret key's.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ErrCode } from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { autumnAs } from "@tests/utils/testInitUtils/autumnAs.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test(`${chalk.yellowBright("s.member: adds a fresh org member per built-in role")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [s.member({ role: "sales" }), s.member({ role: "member" })],
		actions: [],
	});

	expect(members.map((m) => m.role)).toEqual(["sales", "member"]);
	expect(members[0].userId).not.toBe(members[1].userId);

	for (const m of members) {
		const { role } = await getScopesForUserInOrg({
			db: ctx.db,
			userId: m.userId,
			organizationId: ctx.org.id,
		});
		expect(role).toBe(m.role);
	}
});

test(`${chalk.yellowBright("autumnAs: requests carry the member's role scopes")}`, async () => {
	const customerId = "approvals-principal-cus";

	const {
		members: [sales, readOnly],
	} = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.member({ role: "sales" }),
			s.member({ role: "member" }),
		],
		actions: [],
	});

	// Sales has customers:write
	await autumnAs(sales).customers.create({ id: customerId, name: "Principal" });

	// Member has customers:read only
	const customer =
		await autumnAs(readOnly).customers.get<ApiCustomerV5>(customerId);
	expect(customer.id).toBe(customerId);

	await expectAutumnError({
		errCode: ErrCode.InsufficientScopes,
		func: () =>
			autumnAs(readOnly).customers.create({
				id: `${customerId}-denied`,
				name: "Denied",
			}),
	});
});
