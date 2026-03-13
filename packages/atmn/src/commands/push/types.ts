import type { Feature, Plan } from "../../compose/models/index.js";

/**
 * Types for the push command
 */

// Feature delete info from API
export interface FeatureDeleteInfo {
	id: string;
	canDelete: boolean;
	reason?: "credit_system" | "products";
	referencingCreditSystems?: string[]; // IDs of credit systems using this feature
	referencingProducts?: { name: string; count: number };
	featureType?: "boolean" | "metered" | "credit_system"; // For sorting (delete credit systems first)
}

// Plan delete info from API
export interface PlanDeleteInfo {
	id: string;
	canDelete: boolean;
	customerCount: number;
	firstCustomerName?: string;
}

// Plan update info
export interface PlanUpdateInfo {
	plan: Plan;
	willVersion: boolean;
	isArchived: boolean;
	requiresVersioningRecheck?: boolean;
}

// Analysis result
export interface PushAnalysis {
	featuresToCreate: Feature[];
	featuresToUpdate: Feature[];
	featuresToDelete: FeatureDeleteInfo[];
	plansToCreate: Plan[];
	plansToUpdate: PlanUpdateInfo[];
	plansToDelete: PlanDeleteInfo[];
	archivedFeatures: Feature[]; // Features in local config that are archived remotely
	archivedPlans: Plan[]; // Plans in local config that are archived remotely
}

// Push result
export interface PushResult {
	featuresCreated: string[];
	featuresUpdated: string[];
	featuresDeleted: string[];
	featuresArchived: string[];
	featuresSkipped: string[];
	plansCreated: string[];
	plansUpdated: string[];
	plansVersioned: string[]; // Plans that created a new version
	plansDeleted: string[];
	plansArchived: string[];
	plansSkipped: string[];
}

// Remote data fetched during analysis
export interface RemoteData {
	features: Feature[];
	plans: Plan[];
}
