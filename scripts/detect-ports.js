import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VITE_PORT = 3000;
const DEFAULT_SERVER_PORT = 8080;

/**
 * Check if a port is available
 */
async function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer();

		server.once('error', (err) => {
			if (err.code === 'EADDRINUSE') {
				resolve(false);
			} else {
				resolve(false);
			}
		});

		server.once('listening', () => {
			server.close();
			resolve(true);
		});

		server.listen(port);
	});
}

/**
 * Find the next available port starting from the given port
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
	for (let i = 0; i < maxAttempts; i++) {
		const port = startPort + i;
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	throw new Error(`Could not find available port starting from ${startPort}`);
}

/**
 * Update or create .env file with the detected ports
 */
function updateEnvFile(filePath, updates) {
	let content = '';

	if (fs.existsSync(filePath)) {
		content = fs.readFileSync(filePath, 'utf-8');
	}

	// Parse existing env file
	const lines = content.split('\n');
	const envMap = new Map();

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith('#')) {
			const [key, ...valueParts] = trimmed.split('=');
			if (key) {
				envMap.set(key.trim(), valueParts.join('='));
			}
		}
	}

	// Update with new values
	for (const [key, value] of Object.entries(updates)) {
		envMap.set(key, value);
	}

	// Rebuild content preserving comments and empty lines
	const newLines = [];
	const processedKeys = new Set();

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			newLines.push(line);
			continue;
		}

		const [key] = trimmed.split('=');
		if (key && envMap.has(key.trim())) {
			processedKeys.add(key.trim());
			newLines.push(`${key.trim()}=${envMap.get(key.trim())}`);
		} else {
			newLines.push(line);
		}
	}

	// Add new keys that weren't in the original file
	for (const [key, value] of envMap.entries()) {
		if (!processedKeys.has(key)) {
			newLines.push(`${key}=${value}`);
		}
	}

	fs.writeFileSync(filePath, newLines.join('\n'));
}

async function detectAndSetPorts() {
	const vitePort = await findAvailablePort(DEFAULT_VITE_PORT);
	const serverPort = await findAvailablePort(DEFAULT_SERVER_PORT);

	console.log(`🔍 Detected available ports:`);
	console.log(`   Frontend: ${vitePort}`);
	console.log(`   Backend: ${serverPort}`);

	// Get root directory (parent of scripts folder)
	const rootDir = path.dirname(new URL(import.meta.url).pathname);
	const projectRoot = path.join(rootDir, '..');

	// Update vite .env
	const viteEnvPath = path.join(projectRoot, 'vite', '.env');
	updateEnvFile(viteEnvPath, {
		VITE_FRONTEND_URL: `http://localhost:${vitePort}`,
		VITE_BACKEND_URL: `http://localhost:${serverPort}`,
	});

	// Update server .env
	const serverEnvPath = path.join(projectRoot, 'server', '.env');
	updateEnvFile(serverEnvPath, {
		BETTER_AUTH_URL: `http://localhost:${serverPort}`,
		CLIENT_URL: `http://localhost:${vitePort}`,
	});

	// Set environment variables for current process
	process.env.VITE_PORT = vitePort.toString();
	process.env.SERVER_PORT = serverPort.toString();
	process.env.VITE_FRONTEND_URL = `http://localhost:${vitePort}`;
	process.env.VITE_BACKEND_URL = `http://localhost:${serverPort}`;
	process.env.BETTER_AUTH_URL = `http://localhost:${serverPort}`;
	process.env.CLIENT_URL = `http://localhost:${vitePort}`;

	console.log(`✅ Environment variables updated`);

	return { vitePort, serverPort };
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	detectAndSetPorts()
		.then(({ vitePort, serverPort }) => {
			console.log(`\n🚀 Ready to start development servers`);
			process.exit(0);
		})
		.catch((error) => {
			console.error('Error detecting ports:', error);
			process.exit(1);
		});
}

export { detectAndSetPorts, findAvailablePort, isPortAvailable };
