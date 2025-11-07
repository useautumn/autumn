import { Box, Text, render } from "ink";
import Spinner from "ink-spinner";
import React, { useEffect, useState } from "react";

export type TestFileStatus = "pending" | "running" | "passed" | "failed";

export type TestFile = {
	name: string;
	status: TestFileStatus;
	duration?: number;
	error?: string;
};

export type GroupStatus = "pending" | "setup" | "running" | "passed" | "failed";

export type TestGroupState = {
	slug: string;
	status: GroupStatus;
	files: TestFile[];
	duration?: number;
	error?: string;
};

type TestRunnerUIProps = {
	groups: TestGroupState[];
	onExit?: () => void;
};

const TestFileRow = ({ file }: { file: TestFile }) => {
	let icon: React.ReactNode;
	let color: "green" | "red" | "yellow" | "gray" = "gray";

	switch (file.status) {
		case "pending":
			icon = <Text color="gray">…</Text>;
			color = "gray";
			break;
		case "running":
			icon = (
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
			);
			color = "gray";
			break;
		case "passed":
			icon = <Text color="green">✓</Text>;
			color = "gray";
			break;
		case "failed":
			icon = <Text color="red">✗</Text>;
			color = "red";
			break;
	}

	return (
		<Box>
			<Text>  {icon} </Text>
			<Text color={color}>{file.name}</Text>
			{file.duration && (
				<Text color="gray"> ({(file.duration / 1000).toFixed(1)}s)</Text>
			)}
			{file.error && (
				<Box marginLeft={4} flexDirection="column">
					<Text color="yellow" dimColor>
						→ {file.error.split("\n")[0].slice(0, 80)}
					</Text>
				</Box>
			)}
		</Box>
	);
};

const TestGroupBox = ({ group }: { group: TestGroupState }) => {
	let statusIcon: React.ReactNode;
	let statusColor: "green" | "red" | "cyan" | "gray" = "gray";
	let statusText = "";

	switch (group.status) {
		case "pending":
			statusIcon = <Text color="gray">…</Text>;
			statusText = "Pending";
			statusColor = "gray";
			break;
		case "setup":
			statusIcon = (
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
			);
			statusText = "Setting up";
			statusColor = "cyan";
			break;
		case "running":
			statusIcon = (
				<Text color="cyan">
					<Spinner type="dots" />
				</Text>
			);
			statusText = "Running";
			statusColor = "cyan";
			break;
		case "passed":
			statusIcon = <Text color="green">✓</Text>;
			statusText = "Passed";
			statusColor = "green";
			break;
		case "failed":
			statusIcon = <Text color="red">✗</Text>;
			statusText = "Failed";
			statusColor = "red";
			break;
	}

	const passedCount = group.files.filter((f) => f.status === "passed").length;
	const failedCount = group.files.filter((f) => f.status === "failed").length;
	const runningCount = group.files.filter((f) => f.status === "running").length;

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text bold color={statusColor}>
					{statusIcon} {group.slug}
				</Text>
				<Text color="gray"> - {statusText}</Text>
				{group.duration && (
					<Text color="gray"> ({(group.duration / 1000).toFixed(1)}s)</Text>
				)}
			</Box>

			{group.status !== "pending" && group.files.length > 0 && (
				<Box flexDirection="column" marginLeft={2}>
					<Box>
						<Text color="gray">
							{passedCount > 0 && (
								<Text color="green">✓ {passedCount} </Text>
							)}
							{failedCount > 0 && <Text color="red">✗ {failedCount} </Text>}
							{runningCount > 0 && (
								<Text color="cyan">
									<Spinner type="dots" /> {runningCount}{" "}
								</Text>
							)}
						</Text>
					</Box>

					{/* Show running and failed files */}
					{group.files
						.filter((f) => f.status === "running" || f.status === "failed")
						.map((file) => (
							<TestFileRow key={file.name} file={file} />
						))}
				</Box>
			)}

			{group.error && group.status === "failed" && (
				<Box marginLeft={2}>
					<Text color="yellow">Error: {group.error}</Text>
				</Box>
			)}
		</Box>
	);
};

const TestRunnerUI = ({ groups }: TestRunnerUIProps) => {
	const totalGroups = groups.length;
	const completedGroups = groups.filter(
		(g) => g.status === "passed" || g.status === "failed",
	).length;
	const passedGroups = groups.filter((g) => g.status === "passed").length;
	const failedGroups = groups.filter((g) => g.status === "failed").length;

	// Calculate total test stats
	let totalTests = 0;
	let passedTests = 0;
	let failedTests = 0;

	for (const group of groups) {
		totalTests += group.files.length;
		passedTests += group.files.filter((f) => f.status === "passed").length;
		failedTests += group.files.filter((f) => f.status === "failed").length;
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					PARALLEL TEST RUNNER
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>
					Groups: {completedGroups}/{totalGroups} |{" "}
				</Text>
				<Text color="green">✓ {passedGroups} </Text>
				<Text> | </Text>
				<Text color={failedGroups > 0 ? "red" : "gray"}>
					✗ {failedGroups}
				</Text>
				<Text> | </Text>
				<Text>
					Tests: {passedTests + failedTests}/{totalTests} |{" "}
				</Text>
				<Text color="green">✓ {passedTests} </Text>
				<Text> | </Text>
				<Text color={failedTests > 0 ? "red" : "gray"}>✗ {failedTests}</Text>
			</Box>

			<Box flexDirection="column">
				{groups.map((group) => (
					<TestGroupBox key={group.slug} group={group} />
				))}
			</Box>
		</Box>
	);
};

export type UpdateFn = (
	groupSlug: string,
	update: Partial<TestGroupState>,
) => void;

export const createTestRunnerUI = (
	initialGroups: TestGroupState[],
): {
	updateGroup: UpdateFn;
	waitUntilExit: () => Promise<void>;
	cleanup: () => void;
} => {
	let groups = initialGroups;
	let rerender: (() => void) | null = null;
	let exitResolve: (() => void) | null = null;

	const { clear, unmount } = render(
		<TestRunnerUI groups={groups} onExit={() => exitResolve?.()} />,
	);

	const updateGroup: UpdateFn = (groupSlug, update) => {
		const groupIndex = groups.findIndex((g) => g.slug === groupSlug);
		if (groupIndex === -1) return;

		groups = [
			...groups.slice(0, groupIndex),
			{ ...groups[groupIndex], ...update },
			...groups.slice(groupIndex + 1),
		];

		// Force re-render with new state
		unmount();
		const result = render(
			<TestRunnerUI groups={groups} onExit={() => exitResolve?.()} />,
		);
		rerender = result.clear;
	};

	return {
		updateGroup,
		waitUntilExit: () =>
			new Promise<void>((resolve) => {
				exitResolve = resolve;
			}),
		cleanup: () => {
			unmount();
		},
	};
};
