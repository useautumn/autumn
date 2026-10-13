import { cn } from "@autumn/ui/lib/utils";

/** Header, included and tier rows share one grid so their columns line up. */
export const tierTableRowClassName = ({
	showsFlatFee,
}: {
	showsFlatFee: boolean;
}) =>
	cn(
		"grid items-center gap-2 px-2.5",
		showsFlatFee
			? "grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_1.5rem]"
			: "grid-cols-[6rem_minmax(0,1fr)_1.5rem]",
	);
