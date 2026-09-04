export type CaseWorkspace = {
	dir: string;
	cleanup: () => Promise<void>;
};
