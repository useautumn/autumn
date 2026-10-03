/** Per customer, how many of its checks a partition holds waiting for a load. */
export type CheckAdmission = {
	/** Runs the check, or throws CheckCapacityError when its customer is at the cap. */
	admit<Result>(params: {
		customerKey: string;
		run: () => Promise<Result>;
	}): Promise<Result>;
	readCounters(): CheckAdmissionCounters;
};

export type CheckAdmissionCounters = {
	/** Checks refused since the partition started because their customer was at the cap. */
	checksShed: number;
};
