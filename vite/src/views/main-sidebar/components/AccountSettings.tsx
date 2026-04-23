import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/v2/dialogs/Dialog";
import { PasskeysSection } from "./account-settings/PasskeysSection";
import { TwoFactorSection } from "./account-settings/TwoFactorSection";

type AccountSettingsTab = "security";

const tabsContentClassName = "h-full overflow-y-auto focus-visible:ring-0";

export const AccountSettings = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const [currentTab, setCurrentTab] = useState<AccountSettingsTab>("security");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild></DialogTrigger>
			<DialogContent className="gap-0 p-0 rounded-xs w-[90%] max-w-[750px] h-[550px] flex flex-col justify-between">
				<div className="flex flex-col gap-6 overflow-hidden h-full">
					<DialogHeader className="px-6 pt-6">
						<DialogTitle>Account</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-6 h-full overflow-hidden">
						<Tabs
							className="flex flex-col h-full focus-visible:ring-none"
							value={currentTab}
							onValueChange={setCurrentTab as (val: string) => void}
						>
							<div className="flex justify-between items-center px-6">
								<TabsList className="p-0 flex gap-4 justify-start w-fit bg-transparent!">
									<TabsTrigger value="security">Security</TabsTrigger>
								</TabsList>
							</div>

							<TabsContent value="security" className={tabsContentClassName}>
								<div className="px-6 pt-1.5 pb-6 w-full h-full flex flex-col gap-8">
									<PasskeysSection />
									<TwoFactorSection />
								</div>
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
