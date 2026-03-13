import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { createConfigBackup } from "../../../commands/nuke/backup.js";
import {
	getMaxCustomers,
	NukeValidationError,
	validateCustomerLimit,
	validateSandboxOnly,
} from "../../../commands/nuke/validation.js";
import { AppEnv } from "../../../lib/env/detect.js";
import { getKey } from "../../../lib/env/index.js";
import { useNuke } from "../../../lib/hooks/useNuke.js";
import { useNukeData } from "../../../lib/hooks/useNukeData.js";
import { Card, CardWidthProvider, LoadingText } from "../components/index.js";
import { BackupPrompt } from "./components/BackupPrompt.js";
import { ConfirmScreen } from "./components/ConfirmScreen.js";
import { DeletionProgress } from "./components/DeletionProgress.js";
import { FinalSummary } from "./components/FinalSummary.js";
import { SuccessScreen } from "./components/SuccessScreen.js";
import { WarningScreen } from "./components/WarningScreen.js";
import { NukeAnimation } from "./NukeAnimation.js";

type NukeState =
	| "loading"
	| "error"
	| "warning"
	| "backup"
	| "confirm"
	| "deleting"
	| "success"
	| "explosion"
	| "final";

/**
 * Main nuke flow orchestrator for standalone nuke command
 * Manages state transitions through the confirmation and deletion process
 */
export function NukeView() {
	const { exit } = useApp();
	const [state, setState] = useState<NukeState>(() => {
		try {
			const secretKey = getKey(AppEnv.Sandbox);
			validateSandboxOnly(secretKey);
			return "loading";
		} catch {
			return "error";
		}
	});
	const [backupCreated, setBackupCreated] = useState(false);
	const [error, setError] = useState<string | null>(() => {
		try {
			const secretKey = getKey(AppEnv.Sandbox);
			validateSandboxOnly(secretKey);
			return null;
		} catch (err) {
			if (err instanceof NukeValidationError) return err.message;
			return "Failed to validate environment";
		}
	});

	// Fetch org and counts
	const { data: nukeData, isLoading, error: fetchError } = useNukeData();

	// Nuke mutation
	const {
		nuke,
		phases,
		activePhase,
		totalElapsed,
		isNuking: _isNuking,
		error: _nukeError,
	} = useNuke({
		onComplete: () => {
			setState("success");
		},
		onError: (err) => {
			setError(err.message);
			setState("error");
		},
	});

	// After data loads, validate customer limit
	useEffect(() => {
		if (state === "loading" && nukeData) {
			try {
				const maxCustomers = getMaxCustomers();
				validateCustomerLimit(nukeData.customersCount, maxCustomers);
				setState("warning");
			} catch (err) {
				if (err instanceof NukeValidationError) {
					setError(err.message);
					setState("error");
				}
			}
		}
	}, [state, nukeData]);

	const handleWarningConfirm = () => {
		setState("backup");
	};

	const handleWarningCancel = () => {
		exit();
	};

	const handleBackupChoice = (createBackup: boolean) => {
		if (createBackup) {
			const result = createConfigBackup();
			if (result.created) {
				setBackupCreated(true);
			}
		}
		setState("confirm");
	};

	const handleFinalConfirm = () => {
		setState("deleting");
		// Start the nuke operation
		nuke();
	};

	const handleFinalCancel = () => {
		exit();
	};

	const handleSuccessComplete = () => {
		setState("explosion");
	};

	const handleExplosionComplete = () => {
		setState("final");
	};

	// Auto-exit after showing final summary for 2 seconds
	useEffect(() => {
		if (state === "final") {
			const timer = setTimeout(() => {
				exit();
			}, 2000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [state, exit]);

	// Render current state
	if (state === "loading") {
		if (isLoading) {
			return (
				<CardWidthProvider>
					<Box flexDirection="column" marginBottom={1}>
						<Card title="☢ Sandbox Nuke">
							<LoadingText text="Loading organization data..." />
						</Card>
					</Box>
				</CardWidthProvider>
			);
		}

		if (fetchError) {
			return (
				<CardWidthProvider>
					<Box flexDirection="column" marginBottom={1}>
						<Card title="✗ Error">
							<Text color="red">Failed to load data</Text>
							<Text dimColor>{fetchError.message}</Text>
						</Card>
					</Box>
				</CardWidthProvider>
			);
		}
	}

	if (state === "error") {
		return (
			<CardWidthProvider>
				<Box flexDirection="column" marginBottom={1}>
					<Card title="✗ Error">
						<Text color="red">{error}</Text>
					</Card>
				</Box>
			</CardWidthProvider>
		);
	}

	if (!nukeData) {
		return null;
	}

	// Wrap all nuke screens in CardWidthProvider for consistent widths
	const renderContent = () => {
		switch (state) {
			case "warning":
				return (
					<WarningScreen
						orgName={nukeData.orgName}
						customers={nukeData.customersCount}
						plans={nukeData.plansCount}
						features={nukeData.featuresCount}
						onConfirm={handleWarningConfirm}
						onCancel={handleWarningCancel}
					/>
				);

			case "backup":
				return <BackupPrompt onChoice={handleBackupChoice} />;

			case "confirm":
				return (
					<ConfirmScreen
						orgName={nukeData.orgName}
						customers={nukeData.customersCount}
						plans={nukeData.plansCount}
						features={nukeData.featuresCount}
						onConfirm={handleFinalConfirm}
						onCancel={handleFinalCancel}
					/>
				);

			case "deleting":
				return (
					<DeletionProgress
						phases={phases}
						activePhase={activePhase}
						totalElapsed={totalElapsed}
					/>
				);

			case "success":
				return (
					<SuccessScreen
						customers={nukeData.customersCount}
						plans={nukeData.plansCount}
						features={nukeData.featuresCount}
						backupCreated={backupCreated}
						onComplete={handleSuccessComplete}
					/>
				);

			case "explosion":
				return (
					<NukeAnimation
						onComplete={handleExplosionComplete}
						contained={false}
					/>
				);

			case "final":
				return (
					<FinalSummary
						customers={nukeData.customersCount}
						plans={nukeData.plansCount}
						features={nukeData.featuresCount}
						backupCreated={backupCreated}
					/>
				);

			default:
				return null;
		}
	};

	return <CardWidthProvider>{renderContent()}</CardWidthProvider>;
}
