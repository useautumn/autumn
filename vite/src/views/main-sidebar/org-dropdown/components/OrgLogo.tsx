import type { FrontendOrg } from "@autumn/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { orgAvatarKeycap } from "./orgAvatarKeycap";

export const OrgLogo = ({ org }: { org: FrontendOrg }) => {
	const firstLetter = org?.name?.charAt(0).toUpperCase() || "A";
	// Track the specific URL that failed so the fallback self-resets when the
	// org (or its logo) changes, instead of sticking on the letter.
	const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

	const showLogo = Boolean(org?.logo) && org.logo !== failedLogoUrl;

	return (
		<div
			className={cn(
				"relative flex size-5 min-h-5 min-w-5 items-center justify-center overflow-hidden rounded-md",
				orgAvatarKeycap.drop,
				!showLogo && orgAvatarKeycap.surface,
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
				<span className="flex size-full items-center justify-center text-[11px]">
					{firstLetter}
				</span>
			)}
			<span aria-hidden className={orgAvatarKeycap.edge} />
		</div>
	);
};
