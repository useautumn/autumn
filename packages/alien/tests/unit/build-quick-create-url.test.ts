import { describe, expect, test } from "bun:test";
import { buildQuickCreateUrl } from "../../src/setup/buildQuickCreateUrl.js";

const TEMPLATE_URL =
	"https://templates.example.com/autumn/atom/cloudformation.yaml?v=1";

const quickCreate = (
	network: Parameters<typeof buildQuickCreateUrl>[0]["network"],
) => {
	const url = new URL(
		buildQuickCreateUrl({
			templateUrl: TEMPLATE_URL,
			region: "eu-west-2",
			stackName: "autumn-byoc-acme-live",
			token: "tok_1",
			managingRoleArn: "arn:aws:iam::111122223333:role/alien-management",
			pools: { stateful: { machine: "c7g.xlarge", machines: 1 } },
			network,
		}),
	);
	const [route, query] = url.hash.split("?");
	return { url, route, params: new URLSearchParams(query) };
};

describe("CloudFormation quick-create link", () => {
	test("opens the console's quick-create page in the chosen region", () => {
		const { url, route } = quickCreate(null);
		expect(url.origin).toBe("https://eu-west-2.console.aws.amazon.com");
		expect(url.pathname).toBe("/cloudformation/home");
		expect(url.searchParams.get("region")).toBe("eu-west-2");
		expect(route).toBe("#/stacks/quickcreate");
	});

	test("carries the template, stack name and setup-link token", () => {
		const { params } = quickCreate(null);
		expect(params.get("templateURL")).toBe(TEMPLATE_URL);
		expect(params.get("stackName")).toBe("autumn-byoc-acme-live");
		expect(params.get("param_Token")).toBe("tok_1");
	});

	test("passes alien's managing role, which the template splits for its account id", () => {
		const { params } = quickCreate(null);
		expect(params.get("param_ManagingRoleArn")).toBe(
			"arn:aws:iam::111122223333:role/alien-management",
		);
	});

	test("each pool's machine type and count are the template's Compute<Pool> params", () => {
		const { params } = quickCreate(null);
		expect(params.get("param_ComputeStatefulMachine")).toBe("c7g.xlarge");
		expect(params.get("param_ComputeStatefulMachines")).toBe("1");
	});

	test("no network leaves the template's network defaults", () => {
		const { params } = quickCreate(null);
		expect(params.has("param_NetworkMode")).toBe(false);
		expect(params.has("param_EndpointAccess")).toBe(false);
	});

	test("a new VPC is created and served over the internet", () => {
		const { params } = quickCreate({ type: "create" });
		expect(params.get("param_NetworkMode")).toBe("create-new");
		expect(params.get("param_EndpointAccess")).toBe("internet");
		expect(params.has("param_VpcId")).toBe(false);
	});

	test("an existing VPC is used as is and kept private to it", () => {
		const { params } = quickCreate({
			type: "byo-vpc-aws",
			vpc_id: "vpc-1",
			public_subnet_ids: [],
			private_subnet_ids: ["subnet-a", "subnet-b"],
		});
		expect(params.get("param_NetworkMode")).toBe("use-existing");
		expect(params.get("param_VpcId")).toBe("vpc-1");
		expect(params.get("param_PrivateSubnetIds")).toBe("subnet-a,subnet-b");
		expect(params.get("param_PublicSubnetIds")).toBe("");
		expect(params.get("param_EndpointAccess")).toBe("private");
	});
});
