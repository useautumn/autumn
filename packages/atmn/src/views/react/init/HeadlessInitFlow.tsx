import { Box, Text, useApp } from "ink";
import { useEffect, useRef, useState } from "react";
import { pull } from "../../../commands/pull/pull.js";
import { AppEnv } from "../../../lib/env/index.js";
import {
	useConfigCounts,
	useCreateSkills,
	useHeadlessAuth,
} from "../../../lib/hooks/index.js";
import { detectMonorepo } from "../../../lib/utils/monorepo.js";
import { writeEmptyConfig } from "../../../lib/writeEmptyConfig.js";

type Step = "auth" | "detect" | "sync" | "skills" | "complete" | "error";

// Default skills location for headless mode
const DEFAULT_SKILLS_DIR = ".claude/skills";

interface SyncResult {
	features: number;
	plans: number;
	typesPath?: string;
}

export function HeadlessInitFlow() {
	const { exit } = useApp();
	const [step, setStep] = useState<Step>("auth");
	const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [monorepoInfo, setMonorepoInfo] = useState<{ detected: boolean; reason?: string } | null>(null);

	// Hooks
	const { authState, orgInfo, error: authError } = useHeadlessAuth();
	const {
		data: configCounts,
		isLoading: isLoadingConfig,
		error: configError,
	} = useConfigCounts();
	const {
		create: createSkills,
		state: skillsState,
		filesCreated,
		skillsDir,
	} = useCreateSkills();

	// Refs to prevent double-execution
	const hasStartedSync = useRef(false);
	const hasStartedSkills = useRef(false);

	// Step 1: Auth -> Detect
	useEffect(() => {
		if (step !== "auth") return;

		if (authState === "authenticated") {
			setStep("detect");
		} else if (authState === "error") {
			setErrorMessage(authError || "Authentication failed");
			setStep("error");
		}
	}, [step, authState, authError]);

	// Step 2: Detect -> Sync
	useEffect(() => {
		if (step !== "detect") return;

		if (configError) {
			setErrorMessage(
				configError instanceof Error
					? configError.message
					: "Failed to check configuration",
			);
			setStep("error");
			return;
		}

		if (!isLoadingConfig && configCounts) {
			setStep("sync");
		}
	}, [step, isLoadingConfig, configCounts, configError]);

	// Step 3: Sync step
	useEffect(() => {
		if (step !== "sync" || hasStartedSync.current || !configCounts) return;
		hasStartedSync.current = true;

		const doSync = async () => {
			try {
				const hasConfig =
					configCounts.plansCount > 0 || configCounts.featuresCount > 0;

				if (hasConfig) {
					// Pull existing config
					const result = await pull({
						generateSdkTypes: true,
						cwd: process.cwd(),
						environment: AppEnv.Sandbox,
					});
					setSyncResult({
						features: result.features.length,
						plans: result.plans.length,
						typesPath: result.sdkTypesPath,
					});
				} else {
					// Write empty config
					writeEmptyConfig();
					setSyncResult({ features: 0, plans: 0 });
				}
				setStep("skills");
			} catch (err) {
				setErrorMessage(
					err instanceof Error ? err.message : "Failed to sync configuration",
				);
				setStep("error");
			}
		};

		doSync();
	}, [step, configCounts]);

	// Step 4: Skills step
	useEffect(() => {
		if (step !== "skills" || hasStartedSkills.current) return;
		hasStartedSkills.current = true;

		const hasPricing = (configCounts?.plansCount ?? 0) > 0;
		createSkills(DEFAULT_SKILLS_DIR, { saveAll: true, hasPricing });
	}, [step, createSkills, configCounts]);

	// Step 5: Skills -> Complete
	useEffect(() => {
		if (step !== "skills") return;

		if (skillsState === "done") {
			// Detect monorepo before completing
			const detected = detectMonorepo();
			setMonorepoInfo(detected);
			setStep("complete");
		} else if (skillsState === "error") {
			setErrorMessage("Failed to create AI skills");
			setStep("error");
		}
	}, [step, skillsState]);

	// Exit on complete or error
	useEffect(() => {
		if (step !== "complete" && step !== "error") {
			return;
		}

		const timer = setTimeout(() => {
			exit(
				step === "error"
					? new Error(errorMessage || "Unknown error")
					: undefined,
			);
		}, 100);
		return () => clearTimeout(timer);
	}, [step, exit, errorMessage]);

	return (
		<Box flexDirection="column" paddingLeft={1}>
			{/* Step 1: Auth - always show */}
			<Text>Checking authentication...</Text>
		{authState === "authenticating" && (
			<Text dimColor>Waiting for authentication... (timeout: 5 minutes)</Text>
		)}
			{authState === "authenticated" && orgInfo && (
				<Text color="green">
					{"✓"} Logged in as {orgInfo.name} ({orgInfo.slug})
				</Text>
			)}

			{/* Step 2: Detect - show after auth complete */}
			{step !== "auth" && (
				<>
					<Text>{"\n"}Checking your sandbox...</Text>
					{isLoadingConfig && <Text dimColor>Loading...</Text>}
					{configCounts && (
						<Text color="green">
							{"✓"}{" "}
							{configCounts.plansCount > 0 || configCounts.featuresCount > 0
								? `Found ${configCounts.plansCount} plans, ${configCounts.featuresCount} features`
								: "Sandbox is empty"}
						</Text>
					)}
				</>
			)}

			{/* Step 3: Sync - show after detect */}
			{(step === "sync" || step === "skills" || step === "complete") &&
				configCounts && (
					<>
						<Text>
							{"\n"}
							{configCounts.plansCount > 0 || configCounts.featuresCount > 0
								? "Pulling configuration..."
								: "Creating empty config..."}
						</Text>
						{syncResult && (
							<>
								<Text color="green">
									{"✓"}{" "}
									{configCounts.plansCount > 0 || configCounts.featuresCount > 0
										? `Pulled ${syncResult.features} features, ${syncResult.plans} plans`
										: "Created autumn.config.ts"}
								</Text>
								{syncResult.typesPath && (
									<Text color="green">
										{"✓"} Generated SDK types at: {syncResult.typesPath}
									</Text>
								)}
							</>
						)}
					</>
				)}

			{/* Step 4: Skills - show after sync */}
			{(step === "skills" || step === "complete") && (
				<>
					<Text>{"\n"}Creating AI skills...</Text>
					{skillsState === "done" && (
						<>
							<Text color="green">
								{"✓"} Created {skillsDir}/
							</Text>
							{filesCreated.map((file, i) => (
								<Text key={file} color="cyan">
									{"  "}
									{i === filesCreated.length - 1 ? "└──" : "├──"} {file}
								</Text>
							))}
						</>
					)}
				</>
			)}

			{/* Step 5: Complete */}
			{step === "complete" && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Setup complete!</Text>
					<Text>{"\n"}Next steps:</Text>
					<Text>
						1. Skills in {skillsDir}/ are auto-detected by AI coding assistants
					</Text>
					<Text>
						2. Ask your AI assistant to help integrate Autumn billing
					</Text>
				<Text>
					3. Run `atmn push` when ready to deploy changes to your sandbox
				</Text>

				{/* Monorepo warning */}
				{monorepoInfo?.detected && (
					<Box flexDirection="column" marginTop={1}>
						<Text color="yellow">
							{"⚠️"}  Monorepo detected ({monorepoInfo.reason})
						</Text>
						<Text>   Files were created in the root directory:</Text>
						<Text>   - autumn.config.ts</Text>
						<Text>   - @useautumn-sdk.d.ts</Text>
						{filesCreated.length > 0 && (
							<Text>   - {skillsDir}/</Text>
						)}
						<Text dimColor>
							{"   "}You may want to move these to your preferred package location.
						</Text>
					</Box>
				)}

				<Text>{"\n"}</Text>
				<Text dimColor>Documentation: https://docs.useautumn.com</Text>
				<Text dimColor>Discord: https://discord.gg/atmn</Text>
			</Box>
			)}

			{/* Error state */}
			{step === "error" && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="red">
						{"✗"} {errorMessage}
					</Text>
				</Box>
			)}
		</Box>
	);
}
