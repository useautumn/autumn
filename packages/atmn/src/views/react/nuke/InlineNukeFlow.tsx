import { Box, Text } from "ink";
import Spinner from "ink-spinner";
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
import { BackupPrompt } from "./components/BackupPrompt.js";
import { ConfirmScreen } from "./components/ConfirmScreen.js";
import { DeletionProgress } from "./components/DeletionProgress.js";
import { WarningScreen } from "./components/WarningScreen.js";
import { NukeAnimation } from "./NukeAnimation.js";

type NukeState =
	| "loading"
	| "error"
	| "warning"
	| "backup"
	| "confirm"
	| "deleting"
	| "explosion"
	| "complete";

interface InlineNukeFlowProps {
	onComplete: () => void;
	onCancel: () => void;
}

/**
 * Inline nuke flow for use within InitFlow ConfigStep
 * Simplified flow without fullscreen takeover
 */
export function InlineNukeFlow({ onComplete, onCancel }: InlineNukeFlowProps) {
	const [state, setState] = useState<NukeState>(() => {
		try {
			const secretKey = getKey(AppEnv.Sandbox);
			validateSandboxOnly(secretKey);
			return "loading";
		} catch {
			return "error";
		}
	});
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
			setState("explosion");
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
		onCancel();
	};

	const handleBackupChoice = (createBackup: boolean) => {
		if (createBackup) {
			createConfigBackup();
		}
		setState("confirm");
	};

	const handleFinalConfirm = () => {
		setState("deleting");
		nuke();
	};

	const handleFinalCancel = () => {
		onCancel();
	};

	const handleExplosionComplete = () => {
		setState("complete");
		// Short delay before calling onComplete
		setTimeout(() => {
			onComplete();
		}, 500);
	};

	// Render current state
	if (state === "loading") {
		if (isLoading) {
			return (
				<Box flexDirection="column">
					<Text>
						<Text color="magenta">
							<Spinner type="dots" />
						</Text>{" "}
						Loading organization data...
					</Text>
				</Box>
			);
		}

		if (fetchError) {
			return (
				<Box flexDirection="column">
					<Text color="red">✗ Failed to load data</Text>
					<Text dimColor>{fetchError.message}</Text>
				</Box>
			);
		}
	}

	if (state === "error") {
		return (
			<Box flexDirection="column">
				<Text color="red">{error}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	if (!nukeData) {
		return null;
	}

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

		case "explosion":
			return (
				<Box flexDirection="column">
					<NukeAnimation
						onComplete={handleExplosionComplete}
						contained={true}
						containedHeight={10}
						maxFrames={20}
					/>
				</Box>
			);

		case "complete":
			return null;

		default:
			return null;
	}
}
