#!/usr/bin/env node
import { render } from "ink";
import { AgentStep } from "./init/steps/AgentStep.js";

// Test the AgentStep component standalone
function TestAgentStep() {
	return (
		<AgentStep
			step={3}
			totalSteps={4}
			onComplete={() => {
				console.log("Agent setup complete!");
				process.exit(0);
			}}
		/>
	);
}

render(<TestAgentStep />);
