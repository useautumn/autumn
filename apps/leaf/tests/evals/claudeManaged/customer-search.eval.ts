// Customer search behaviors that trip up real support flows:
// 1. Disambiguation — "get me details on quillforge" matches three customers
//    (two personal SSO accounts share the @quillforge.example email domain),
//    but only one is the company account, and its id is not guessable from the
//    name. The agent must search, pick the most likely customer, and answer
//    without asking which one.
// 2. Pagination — an exact-count question over 143 customers requires walking
//    listCustomers pages via start_cursor/next_cursor instead of answering
//    from the first page.
import { withCustomers } from "../fixtures/createSetup.js";
import { api, response, tools } from "../fixtures/expectations/index.js";
import { orgSetups } from "../fixtures/orgSetups.js";
import {
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../harness/index.js";

type EvalMetadata = {
	domain: "customers";
	flow: "search";
};

const experimentName = "customer-search";

const FLEET_SIZE = 140;
const quillforgeId = "org_qf_2847";
// Fleet + company account + two personal accounts.
const totalCustomers = FLEET_SIZE + 3;

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ balances, customers, plans }) => ({
		quillforge: customers.withPlan({
			balances: {
				credits: balances.metered({
					featureId: "credits",
					granted: 10_000,
					remaining: 7_450,
				}),
			},
			email: "billing@quillforge.example",
			id: quillforgeId,
			name: "Quillforge",
			plan: plans.scale,
		}),
		priya: customers.base({
			email: "priya@quillforge.example",
			id: "usr_pn_9913",
			name: "Priya Nair",
		}),
		tom: customers.base({
			email: "tom@quillforge.example",
			id: "usr_to_4471",
			name: "Tom Okafor",
		}),
		fleet: Array.from({ length: FLEET_SIZE }, (_, index) =>
			customers.base({
				email: `ops@pilot-${index + 1}.example`,
				id: `pilot-${String(index + 1).padStart(3, "0")}`,
				name: `Pilot ${index + 1}`,
			}),
		),
	}),
});

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "customers",
		flow: "search",
	},
	timeout: 120_000,
	cases: [
		{
			name: "pinpoints company account among personal email matches",
			conversation: [user({ message: "get me details on quillforge" })],
			expect: [
				// listCustomers items carry subscriptions/balances, so answering from
				// the search page (no getCustomer) is valid; identity is pinned by the
				// required facts below.
				tools.called({ toolNames: ["listCustomers"] }),
				response.concise({
					required: [
						`customer is Quillforge (${quillforgeId})`,
						"on the Scale plan",
						"credits: 7,450 of 10,000 remaining",
					],
				}),
			],
		},
		{
			name: "paginates the full customer list for an exact count",
			conversation: [
				user({
					message: "exactly how many customers do we have in autumn right now?",
				}),
			],
			expect: [
				// Two ordered listCustomers calls = the agent followed next_cursor
				// instead of answering from the first page.
				api.calledInOrder({
					calls: [{ toolName: "listCustomers" }, { toolName: "listCustomers" }],
				}),
				response.mentions({ phrases: [String(totalCustomers)] }),
			],
		},
	],
});
