import { Box, Text, useApp, useStdout } from "ink";
import { useEffect, useState } from "react";
import {
	getExplodeFrame,
	getExplosionColor,
} from "../../../lib/animation/explosion.js";

interface NukeAnimationProps {
	onComplete?: () => void;
	maxFrames?: number;
	frameDuration?: number;
	contained?: boolean;
	containedHeight?: number;
}

export function NukeAnimation({
	onComplete,
	maxFrames = 25,
	frameDuration = 16,
	contained = false,
	containedHeight = 10,
}: NukeAnimationProps) {
	const { stdout } = useStdout();
	const { exit } = useApp();
	const [frame, setFrame] = useState(0);
	const [explosionImage, setExplosionImage] = useState("");
	const [color, setColor] = useState("white");

	const termWidth = stdout?.columns || 80;
	const termHeight = stdout?.rows || 24;

	const width = contained ? termWidth - 4 : termWidth;
	const height = contained ? containedHeight - 2 : termHeight - 2;

	useEffect(() => {
		if (frame >= maxFrames) {
			setTimeout(() => {
				if (onComplete) {
					onComplete();
				} else if (!contained) {
					exit();
				}
			}, 500);
			return;
		}

		const image = getExplodeFrame(width, height, frame, maxFrames);
		const frameColor = getExplosionColor(frame, maxFrames);

		setExplosionImage(image);
		setColor(frameColor);

		const timer = setTimeout(() => {
			setFrame((prev) => prev + 1);
		}, frameDuration);

		return () => clearTimeout(timer);
	}, [
		frame,
		maxFrames,
		frameDuration,
		width,
		height,
		onComplete,
		exit,
		contained,
	]);

	if (contained) {
		return (
			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor="magenta"
				paddingX={1}
			>
				<Text color={color as any}>{explosionImage}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" width={width} height={height}>
			<Text color={color as any}>{explosionImage}</Text>
		</Box>
	);
}
