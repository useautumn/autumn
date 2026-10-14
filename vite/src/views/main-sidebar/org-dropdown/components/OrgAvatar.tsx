import { useState } from "react";
import { cn } from "@/lib/utils";
import { orgAvatarKeycap } from "./orgAvatarKeycap";

export const OrgAvatar = ({
	name,
	logo,
}: {
	name: string;
	logo?: string | null;
}) => {
	const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
	const showLogo = Boolean(logo) && logo !== failedLogoUrl;

	return (
		<span
			className={cn(
				"relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-[9.5px] font-semibold",
				orgAvatarKeycap.drop,
				!showLogo && orgAvatarKeycap.surface,
			)}
		>
			{showLogo ? (
				<img
					alt=""
					className="size-full object-cover"
					onError={() => setFailedLogoUrl(logo ?? null)}
					src={logo ?? undefined}
				/>
			) : (
				name.charAt(0).toUpperCase()
			)}
			<span aria-hidden className={orgAvatarKeycap.edge} />
		</span>
	);
};
