import type { FrontendOrg } from "@autumn/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const OrgLogo = ({ org }: { org: FrontendOrg }) => {
	const firstLetter = org?.name?.charAt(0).toUpperCase() || "A";
	// Track the specific URL that failed so the fallback self-resets when the
	// org (or its logo) changes, instead of sticking on the letter.
	const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

	const showLogo = Boolean(org?.logo) && org.logo !== failedLogoUrl;

	return (
		// Centred in a 16px slot to match the nav icons, so the sidebar has one
		// vertical line of icons rather than the logo sitting proud of it.
		<div
			className={cn(
				"rounded-md overflow-hidden flex items-center justify-center w-4 h-4 min-w-4 min-h-4",
			)}
		>
			{showLogo ? (
				<img
					alt={org.name}
					className="w-full h-full object-cover"
					onError={() => setFailedLogoUrl(org.logo ?? null)}
					src={org.logo}
				/>
			) : (
				<span className="w-full h-full flex items-center justify-center bg-linear-to-r from-purple-600 via-purple-500 to-purple-gradient text-white text-[10px]">
					{firstLetter}
				</span>
			)}
		</div>
	);
};
