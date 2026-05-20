import type { FrontendOrg } from "@autumn/shared";

export const OrgLogo = ({ org }: { org: FrontendOrg }) => {
	const firstLetter = org?.name?.charAt(0).toUpperCase() || "A";

	return (
		<div className="rounded-md overflow-hidden flex items-center justify-center bg-zinc-200 w-5 h-5 min-w-5 min-h-5">
			<span className="w-5 h-5 flex items-center justify-center bg-linear-to-r from-purple-600 via-purple-500 to-purple-gradient text-white text-xs">
				{firstLetter}
			</span>
		</div>
	);
};
