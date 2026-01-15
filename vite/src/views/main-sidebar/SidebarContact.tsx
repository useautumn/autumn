"use client";

import { QuestionIcon } from "@phosphor-icons/react";
import { GraduationCap } from "lucide-react";
import { Link } from "react-router";
import CopyButton from "@/components/general/CopyButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEnv } from "@/utils/envUtils";
import { useOnboardingVisibility } from "@/views/onboarding4/hooks/useOnboardingProgress";
import { NavButton } from "./NavButton";

export function SidebarContact() {
	const email = "hey@useautumn.com";
	const env = useEnv();
	const { show: showOnboardingGuide } = useOnboardingVisibility();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<div>
					<NavButton
						env={env}
						value="chat"
						icon={<QuestionIcon size={16} weight="duotone" />}
						title="Need help?"
						onClick={() => {}}
					/>
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start">
				<span className="text-xs text-t3 p-2">
					👋 We respond within 30 minutes
				</span>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => {
						window.location.href = `mailto:${email}`;
					}}
					className="cursor-pointer"
				>
					<div className="flex items-center justify-between w-full">
						{/* <span>{email}</span> */}
						<span>hey@useautumn.com</span>
						<CopyButton
							text={email}
							className="bg-transparent shadow-none hover:bg-zinc-200 w-6 gap-0 h-6 !px-0 py-0 flex items-center justify-center text-t2"
						/>
					</div>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => window.open("https://cal.com/ayrod", "_blank")}
					className="cursor-pointer"
				>
					Book a call
				</DropdownMenuItem>
				<DropdownMenuItem
					className="cursor-pointer h-[30px] flex justify-start"
					asChild
				>
					<Link to="https://discord.gg/STqxY92zuS" target="_blank">
						We're online on Discord
						<span className="relative flex h-2 w-2">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
							<span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
						</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={showOnboardingGuide}
					className="cursor-pointer"
				>
					<GraduationCap size={14} />
					Show onboarding guide
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
