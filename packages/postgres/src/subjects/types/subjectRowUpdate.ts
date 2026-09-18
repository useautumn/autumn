/** One guarded update to one subject row: set `after`, only if the row still holds `before`. */
export type SubjectRowUpdate = {
	table: "customerEntitlements" | "rollovers" | "usageWindows";
	id: string;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
};

export type SubjectRowTable = SubjectRowUpdate["table"];
