import type { SubjectRead } from "../../types/subjectRead.js";

export type InFlightLoad = {
	customerKey: string;
	overtaken: boolean;
};

export type InFlightRead = {
	read: SubjectRead;
	load: InFlightLoad;
};

export type InFlightLoads = {
	join(params: {
		subjectKey: string;
		customerKey: string;
		start: (params: { load: InFlightLoad }) => Promise<SubjectRead>;
	}): Promise<InFlightRead>;
	inFlight(params: { subjectKey: string }): Promise<InFlightRead> | null;
	overtakeCustomer(params: { customerKey: string }): void;
	count(): number;
};
