import { motion } from "motion/react";

export function WelcomeHeader() {
	return (
		<motion.div
			initial={{ opacity: 0, y: -20 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -20 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="text-center mb-8"
		>
			<h1 className="text-2xl font-semibold text-foreground mb-1">
				Welcome to Autumn
			</h1>
			<p className="text-md text-t3 font-normal">
				Get started by building your app's pricing model
			</p>
		</motion.div>
	);
}
