#!/usr/bin/env python3
"""Sync the GitHub PR 'This Stack' query from the current branch, and install Cmd+Shift+H."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[2]
VSCODE = WORKSPACE / ".vscode"
SETTINGS = VSCODE / "settings.json"
SHARED_KEYBINDINGS = VSCODE / "keybindings.json"
TRUNK = {"dev", "main", "master"}
TASK_NAME = "View PR stack"
STACK_QUERY = """
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $number) {
			stack {
				entries(first: 50) {
					nodes {
						position
						pullRequest { headRefName }
					}
				}
			}
		}
	}
}
"""


def cursor_user_dir() -> Path:
	if sys.platform == "darwin":
		return Path.home() / "Library/Application Support/Cursor/User"
	if sys.platform == "win32":
		return Path(os.environ.get("APPDATA", "")) / "Cursor/User"
	return Path.home() / ".config/Cursor/User"


def run_json(args: list[str]) -> object | None:
	result = subprocess.run(args, capture_output=True, text=True)
	if result.returncode != 0 or not result.stdout.strip():
		return None
	return json.loads(result.stdout)


def current_branch() -> str:
	result = subprocess.run(
		["git", "branch", "--show-current"],
		capture_output=True,
		text=True,
		check=True,
	)
	branch = result.stdout.strip()
	if not branch:
		raise SystemExit("no current branch")
	return branch


def repo_owner_name() -> tuple[str, str] | None:
	data = run_json(["gh", "repo", "view", "--json", "owner,name"])
	if not isinstance(data, dict):
		return None
	owner = data.get("owner")
	login = owner.get("login") if isinstance(owner, dict) else None
	name = data.get("name")
	if not login or not name:
		return None
	return login, name


def stack_heads_from_github(*, owner: str, name: str, number: int) -> list[str]:
	result = subprocess.run(
		[
			"gh",
			"api",
			"graphql",
			"-f",
			f"query={STACK_QUERY}",
			"-f",
			f"owner={owner}",
			"-f",
			f"name={name}",
			"-F",
			f"number={number}",
		],
		capture_output=True,
		text=True,
	)
	if result.returncode != 0 or not result.stdout.strip():
		return []
	payload = json.loads(result.stdout)
	stack = (
		payload.get("data", {})
		.get("repository", {})
		.get("pullRequest", {})
		.get("stack")
		or {}
	)
	nodes = (stack.get("entries") or {}).get("nodes") or []
	ordered = sorted(
		(node for node in nodes if node.get("pullRequest", {}).get("headRefName")),
		key=lambda node: node.get("position", 0),
	)
	return [node["pullRequest"]["headRefName"] for node in ordered]


def walk_stack_heads(pr: dict) -> list[str]:
	heads: list[str] = []
	seen: set[str] = set()
	current: dict | None = pr
	while current:
		head = current["headRefName"]
		if head in seen:
			break
		seen.add(head)
		heads.append(head)
		base = current["baseRefName"]
		if base in TRUNK:
			break
		parents = run_json(
			[
				"gh",
				"pr",
				"list",
				"--search",
				f"head:{base} is:open",
				"--json",
				"number,baseRefName,headRefName",
				"--limit",
				"1",
			]
		)
		current = parents[0] if isinstance(parents, list) and parents else None
	heads.reverse()

	queue = [pr["headRefName"]]
	while queue:
		base = queue.pop(0)
		children = run_json(
			[
				"gh",
				"pr",
				"list",
				"--search",
				f"base:{base} is:open",
				"--json",
				"headRefName",
				"--limit",
				"50",
			]
		)
		if not isinstance(children, list):
			continue
		for child in children:
			head = child["headRefName"]
			if head in seen:
				continue
			seen.add(head)
			heads.append(head)
			queue.append(head)

	return heads


def stack_heads(start_branch: str) -> list[str]:
	pr = run_json(["gh", "pr", "view", "--json", "number,baseRefName,headRefName"])
	if not isinstance(pr, dict):
		return [start_branch]

	repo = repo_owner_name()
	if repo:
		heads = stack_heads_from_github(
			owner=repo[0], name=repo[1], number=int(pr["number"])
		)
		if heads:
			return heads

	return walk_stack_heads(pr) or [start_branch]


def query_for(heads: list[str]) -> str:
	ors = " OR ".join(f"head:{head}" for head in heads)
	return f"repo:${{owner}}/${{repository}} is:open ({ors}) sort:created-desc"


QUERIES_RE = re.compile(
	r'\t"githubPullRequests\.queries": \[[^\]]*\]',
	re.DOTALL,
)


def queries_block(query: str) -> str:
	return (
		'\t"githubPullRequests.queries": [\n'
		"\t\t{\n"
		'\t\t\t"label": "This Stack",\n'
		f'\t\t\t"query": "{query}"\n'
		"\t\t}\n"
		"\t]"
	)


def patch_workspace_settings(query: str) -> None:
	block = queries_block(query)
	if not SETTINGS.exists():
		SETTINGS.parent.mkdir(parents=True, exist_ok=True)
		SETTINGS.write_text("{\n" + block + "\n}\n")
		return

	text = SETTINGS.read_text()
	if QUERIES_RE.search(text):
		SETTINGS.write_text(QUERIES_RE.sub(block, text, count=1))
		return

	stripped = text.rstrip()
	if not stripped.endswith("}"):
		raise SystemExit(f"could not patch {SETTINGS}")
	without_close = stripped[:-1].rstrip()
	if not without_close.endswith(","):
		without_close += ","
	SETTINGS.write_text(without_close + "\n" + block + "\n}\n")


def ensure_keybinding() -> None:
	user_path = cursor_user_dir() / "keybindings.json"
	text = user_path.read_text() if user_path.exists() else "[\n]\n"
	if f'"args": "{TASK_NAME}"' in text:
		return
	if "Sync this stack PR query" in text:
		user_path.write_text(text.replace("Sync this stack PR query", TASK_NAME))
		return

	source = json.loads(SHARED_KEYBINDINGS.read_text())
	insert = json.dumps(source, indent="\t")
	if insert.startswith("["):
		insert = insert[1:]
	if insert.endswith("]"):
		insert = insert[:-1]
	insert = insert.strip("\n")
	stripped = text.rstrip()
	if not stripped.endswith("]"):
		raise SystemExit(f"could not patch {user_path}")
	without_close = stripped[:-1].rstrip()
	if without_close.endswith("["):
		user_path.write_text(without_close + "\n" + insert + "\n]\n")
		return
	if not without_close.endswith(","):
		without_close += ","
	user_path.write_text(without_close + "\n" + insert + "\n]\n")


def main() -> None:
	branch = current_branch()
	heads = stack_heads(branch)
	patch_workspace_settings(query_for(heads))
	ensure_keybinding()
	print(f"{branch}: {' -> '.join(heads)}")


if __name__ == "__main__":
	try:
		main()
	except subprocess.CalledProcessError as error:
		sys.exit(error.returncode or 1)
