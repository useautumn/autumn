import { useState } from "react";
import { cn } from "@/lib/utils";
import { orgAvatarFallbackClassName } from "./orgAvatarFallbackClassName";

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
				"flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-[9.5px] font-semibold",
				!showLogo && orgAvatarFallbackClassName,
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
		</span>
	);
};
