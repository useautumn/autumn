export const MigrationStatus = {
	Draft: "draft",
	Waiting: "waiting",
	Running: "running",
	Run: "run",
} as const;

export type MigrationStatus =
	(typeof MigrationStatus)[keyof typeof MigrationStatus];
