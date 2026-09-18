import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import React, { useState } from "react";
import { StatusLine, StepHeader } from "../../components/index.js";

interface PathInputStepProps {
	step: number;
	totalSteps: number;
	monorepoReason: string;
	onComplete: (targetPath: string) => void;
}

type State = "input" | "creating" | "complete" | "error";

export function PathInputStep({
	step,
	totalSteps,
	monorepoReason,
	onComplete,
}: PathInputStepProps) {
	const [state, setState] = useState<State>("input");
	const [inputValue, setInputValue] = useState("");
	const [resolvedPath, setResolvedPath] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const cwd = process.cwd();

	const handleSubmit = async () => {
		if (state !== "input") return;

		setState("creating");

		try {
			// Resolve the path relative to cwd (use cwd if empty)
			const pathToUse = inputValue.trim() || ".";
			const absolutePath = resolve(cwd, pathToUse);
			setResolvedPath(absolutePath);

			// Create directory if it doesn't exist (recursive)
			await mkdir(absolutePath, { recursive: true });

			setState("complete");
			onComplete(absolutePath);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create directory",
			);
			setState("error");
		}
	};

	useInput((_input, key) => {
		if (key.return && state === "input") {
			handleSubmit();
		}
	});

	return (
		<Box flexDirection="column" marginBottom={1}>
			<StepHeader
				step={step}
				totalSteps={totalSteps}
				title="Project Location"
			/>

			{state === "input" && (
				<>
					<Box marginBottom={1}>
						<Text>
							We've detected you're using a monorepo ({monorepoReason}).
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>Where would you like to save your Autumn config files?</Text>
					</Box>
					<Box>
						<Text>Path: </Text>
						<TextInput
							value={inputValue}
							onChange={setInputValue}
							placeholder={cwd}
						/>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>
							(relative or absolute - folders will be created if needed)
						</Text>
					</Box>
				</>
			)}

			{state === "creating" && (
				<StatusLine status="loading" message="Creating directory..." />
			)}

			{state === "complete" && resolvedPath && (
				<StatusLine
					status="success"
					message={`Files will be saved to: ${inputValue.trim() === "" ? "current directory" : inputValue}`}
				/>
			)}

			{state === "error" && (
				<StatusLine
					status="error"
					message={error || "Failed to create directory"}
				/>
			)}
		</Box>
	);
}
