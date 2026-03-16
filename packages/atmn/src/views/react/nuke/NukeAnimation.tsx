import { Box, Text, useApp, useStdout } from "ink";
import { useEffect, useState } from "react";
import {
	getExplodeFrame,
	getExplosionColor,
} from "../../../lib/animation/explosion.js";

interface NukeAnimationProps {
	/** Callback when animation completes */
	onComplete?: () => void;
	/** Number of frames in animation (default: 25) */
	maxFrames?: number;
	/** Frame duration in milliseconds (default: 16ms for 60fps) */
	frameDuration?: number;
	/** If true, animation is contained in a box instead of fullscreen */
	contained?: boolean;
	/** Height for contained animation (default: 10) */
	containedHeight?: number;
}

/**
 * Explosion animation component
 * Displays a beautiful explosion animation similar to LazyGit's nuke
 */
export function NukeAnimation({
	onComplete,
	maxFrames = 25,
	frameDuration = 16, // 60fps = 1000ms / 60 ≈ 16.67ms
	contained = false,
	containedHeight = 10,
}: NukeAnimationProps) {
	const { stdout } = useStdout();
	const { exit } = useApp();
	const [frame, setFrame] = useState(0);
	const [explosionImage, setExplosionImage] = useState("");
	const [color, setColor] = useState("white");

	// Get terminal dimensions
	const termWidth = stdout?.columns || 80;
	const termHeight = stdout?.rows || 24;

	// Use contained dimensions if specified
	// When contained, subtract 4 from width for left/right borders and padding
	// Subtract 2 from height for top/bottom borders to prevent overflow
	const width = contained ? termWidth - 4 : termWidth;
	const height = contained ? containedHeight - 2 : termHeight - 2;

	useEffect(() => {
		if (frame >= maxFrames) {
			// Animation complete
			setTimeout(() => {
				if (onComplete) {
					onComplete();
				} else if (!contained) {
					exit();
				}
			}, 500);
			return;
		}

		// Generate explosion frame
		const image = getExplodeFrame(width, height, frame, maxFrames);
		const frameColor = getExplosionColor(frame, maxFrames);

		setExplosionImage(image);
		setColor(frameColor);

		// Schedule next frame
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
