export type ApplyPulled = (params: {
	customerId: string;
	body: string;
}) => Promise<boolean>;

export type FolderSubjectPulls = {
	request(params: { customerId: string; entityId: string | null }): void;
};

export type SubjectPulls = {
	forFolder(params: {
		tokenHash: () => string;
		applyPulled: ApplyPulled;
	}): FolderSubjectPulls;
	stop(): void;
};
