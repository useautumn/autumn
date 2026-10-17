/** One plan or feature write, judged on its own id under its own verb. */
export type CatalogApprovalCheck =
	| { action: "plans.create" | "plans.update" | "plans.delete"; planId: string }
	| {
			action: "features.create" | "features.update" | "features.delete";
			featureId: string;
	  };
