/** Fixed alien settings: the same in every environment, so only the API key is an environment variable. */
export const ALIEN_WORKSPACE = "autumn";
export const ALIEN_PROJECT = "autumn";
export const ALIEN_HOSTED_API_URL = "https://api.alien.dev";
/** `alien dev`'s default port; `bun dw` offsets it per worktree and passes ALIEN_MANAGER_URL. */
export const ALIEN_LOCAL_MANAGER_URL = "http://localhost:9090";
