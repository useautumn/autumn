import { useState } from "react";

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
		<span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-muted text-[9.5px] font-semibold text-tertiary-foreground dark:bg-[#2A2A2A] dark:text-[#A1A1A1]">
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
