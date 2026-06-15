import type { SeedCustomerInput } from "./customerSeedTypes";

const industries = [
	"Analytics",
	"Architecture",
	"Biotech",
	"Commerce",
	"Compliance",
	"Education",
	"Energy",
	"Fintech",
	"Healthcare",
	"Logistics",
	"Media",
	"Robotics",
] as const;

const companyPrefixes = [
	"Acme",
	"Aperture",
	"Atlas",
	"Bluebird",
	"Brightline",
	"Cedar",
	"Cobalt",
	"Evergreen",
	"Fable",
	"Harbor",
	"Juniper",
	"Lattice",
	"Northstar",
	"Oakline",
	"Prairie",
	"Redwood",
	"Signal",
	"Summit",
	"Terra",
	"Waypoint",
] as const;

const companySuffixes = [
	"Analytics",
	"Cloud",
	"Collective",
	"Data",
	"Dynamics",
	"Group",
	"Health",
	"Labs",
	"Logistics",
	"Media",
	"Research",
	"Systems",
	"Works",
] as const;

const ownerFirstNames = [
	"Alex",
	"Amara",
	"Ben",
	"Camille",
	"Daniel",
	"Elena",
	"Fatima",
	"Grace",
	"Hannah",
	"Ivan",
	"Jonah",
	"Leah",
	"Maya",
	"Nadia",
	"Owen",
	"Priya",
	"Rafael",
	"Sofia",
	"Theo",
	"Vivian",
] as const;

const ownerLastNames = [
	"Brooks",
	"Chen",
	"Diaz",
	"Evans",
	"Foster",
	"Grant",
	"Hughes",
	"Iyer",
	"Kim",
	"Lawson",
	"Morgan",
	"Patel",
	"Reed",
	"Singh",
	"Stone",
	"Turner",
	"Wong",
	"Young",
] as const;

const regions = [
	"AMER",
	"APAC",
	"Benelux",
	"DACH",
	"EMEA",
	"LATAM",
	"Northern Europe",
	"Southern Europe",
] as const;

const lifecycleStages = [
	"evaluation",
	"implementation",
	"launched",
	"expansion",
	"renewal",
] as const;

const workspaceNames = [
	"Billing Ops",
	"Customer Success",
	"Developer Platform",
	"Enterprise Rollout",
	"Finance Systems",
	"Growth Experiments",
	"Knowledge Base",
	"Operations",
	"Partner Portal",
	"Research",
	"Security Review",
	"Support Desk",
] as const;

export type RealisticCustomerSeed = SeedCustomerInput & {
	entityCount: number;
};

const pick = <T>(list: readonly T[], index: number) =>
	list[index % list.length];

const slugify = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

export const buildRealisticCustomerSeed = ({
	index,
	idPrefix,
	entityFeatureId,
	entityCount = index % 3 === 0 ? 2 : 1,
}: {
	index: number;
	idPrefix: string;
	entityFeatureId: string;
	entityCount?: 1 | 2;
}): RealisticCustomerSeed => {
	const name = `${pick(companyPrefixes, index)} ${pick(companySuffixes, Math.floor(index / companyPrefixes.length))}`;
	const id = `${idPrefix}-${String(index + 1).padStart(4, "0")}`;
	const domain = `${slugify(name)}.example`;
	const entities = Array.from({ length: entityCount }, (_, entityIndex) => ({
		id: `${id}-workspace-${entityIndex + 1}`,
		name: `${pick(workspaceNames, index + entityIndex)} Workspace`,
		featureId: entityFeatureId,
	}));

	return {
		id,
		name,
		email: `billing+${id}@${domain}`,
		entityCount,
		entities,
		createInStripe: false,
		internalOptions: { disable_defaults: true },
		skipWebhooks: true,
		metadata: {
			account_owner: `${pick(ownerFirstNames, index)} ${pick(ownerLastNames, index)}`,
			company_size: 25 + ((index * 37) % 975),
			industry: pick(industries, index),
			lifecycle_stage: pick(lifecycleStages, index),
			region: pick(regions, index),
		},
	};
};
