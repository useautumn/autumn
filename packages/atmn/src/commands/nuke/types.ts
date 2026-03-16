/**
 * Types for nuke command
 */

export interface NukeOptions {
	/** Working directory */
	cwd?: string;
	/** Skip confirmations (DANGEROUS - for testing only) */
	skipConfirmations?: boolean;
	/** Max customers to delete */
	maxCustomers?: number;
}

export interface NukeStats {
	customersDeleted: number;
	plansDeleted: number;
	featuresDeleted: number;
	duration: number; // milliseconds
	backupCreated: boolean;
	backupPath?: string;
}

export interface NukeResult {
	success: boolean;
	stats: NukeStats;
	error?: string;
}

export interface DeletionProgress {
	phase: "customers" | "plans" | "features";
	current: number;
	total: number;
	rate?: number; // items per second
}

export interface NukePhaseStats {
	phase: "customers" | "plans" | "features";
	current: number;
	total: number;
	rate: number; // items per second
	duration?: number; // seconds (when complete)
	completed: boolean;
}
