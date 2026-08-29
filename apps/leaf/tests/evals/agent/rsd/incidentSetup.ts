import { BillingInterval } from "@autumn/shared";
import { withCustomers } from "../../fixtures/createSetup.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import { plan } from "../../fixtures/plans/index.js";

/** The incident customer: custom-priced Enterprise plus a transactional
 * add-on, in an org whose Marketing ladder has no 700K size. */
export const incidentSetup = () =>
	withCustomers({
		setup: orgSetups.emailPlatform(),
		customers: ({ customers, plans, subscriptions }) => ({
			sender: {
				...customers.base({
					email: "billing@corvid-interactive.example",
					id: "rsd-customer-0001",
					name: "Corvid Interactive",
				}),
				subscriptions: [
					subscriptions.active({
						plan: plan.customized({
							customize: {
								price: { amount: 720, interval: BillingInterval.Month },
							},
							plan: plans.enterprise,
						}),
					}),
					subscriptions.active({ plan: plans.sendhubPro }),
				],
			},
		}),
	});
