import { Box, Text } from "ink";
import { useState } from "react";

import { ASCII_TITLE } from "../../../constants.js";
import { useHasCustomers } from "../../../lib/hooks/index.js";
import { detectMonorepo, type MonorepoInfo } from "../../../lib/utils/monorepo.js";
import { AuthStep } from "./steps/AuthStep.js";
import { ConfigStep } from "./steps/ConfigStep.js";
import { HandoffStep } from "./steps/HandoffStep.js";
import { PathInputStep } from "./steps/PathInputStep.js";

type Step = "auth" | "path" | "config" | "handoff";

interface OrgInfo {
	name: string;
	slug: string;
}

export function InitFlow() {
	const [currentStep, setCurrentStep] = useState<Step>("auth");
	const [_orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
	const [hasPricing, setHasPricing] = useState<boolean>(false);
	const [targetPath, setTargetPath] = useState<string>(process.cwd());
	const [monorepoInfo, setMonorepoInfo] = useState<MonorepoInfo | null>(null);

	const { data: customersData } = useHasCustomers();

	const handleAuthComplete = (info: OrgInfo) => {
		setOrgInfo(info);

		const detected = detectMonorepo();
		setMonorepoInfo(detected);

		if (detected.detected) {
			setCurrentStep("path");
		} else {
			setCurrentStep("config");
		}
	};

	const handlePathComplete = (path: string) => {
		setTargetPath(path);
		setCurrentStep("config");
	};

	const handleConfigComplete = (configHasPricing: boolean) => {
		setHasPricing(configHasPricing);
		setCurrentStep("handoff");
	};

	const handleHandoffComplete = () => {
	};

	const totalSteps = monorepoInfo?.detected ? 4 : 3;

	return (
		<Box flexDirection="column" paddingLeft={1} paddingRight={1}>
			<Box marginTop={1} marginBottom={1}>
				<Text>{ASCII_TITLE}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					Welcome to{" "}
					<Text color="magenta" bold>
						Autumn
					</Text>
					! Let's set up your billing.
				</Text>
			</Box>

			<AuthStep
				step={1}
				totalSteps={totalSteps}
				onComplete={handleAuthComplete}
			/>

			{monorepoInfo?.detected &&
				(currentStep === "path" ||
					currentStep === "config" ||
					currentStep === "handoff") && (
					<PathInputStep
						step={2}
						totalSteps={totalSteps}
						monorepoReason={monorepoInfo.reason || "monorepo structure"}
						onComplete={handlePathComplete}
					/>
				)}

			{(currentStep === "config" || currentStep === "handoff") && (
				<ConfigStep
					step={monorepoInfo?.detected ? 3 : 2}
					totalSteps={totalSteps}
					targetPath={targetPath}
					onComplete={handleConfigComplete}
				/>
			)}

			{currentStep === "handoff" && (
				<HandoffStep
					step={monorepoInfo?.detected ? 4 : 3}
					totalSteps={totalSteps}
					hasPricing={hasPricing}
					hasCustomers={customersData?.hasCustomers ?? false}
					onComplete={handleHandoffComplete}
				/>
			)}
		</Box>
	);
}
