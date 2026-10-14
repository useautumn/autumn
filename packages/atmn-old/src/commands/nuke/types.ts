export interface NukeOptions {
	cwd?: string;
	skipConfirmations?: boolean;
	maxCustomers?: number;
}

export interface NukeStats {
	customersDeleted: number;
	plansDeleted: number;
	featuresDeleted: number;
	duration: number;
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
	rate?: number;
}

export interface NukePhaseStats {
	phase: "customers" | "plans" | "features";
	current: number;
	total: number;
	rate: number;
	duration?: number;
	completed: boolean;
}
