import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Builds one git-style file diff with a single -U0 hunk. */
export function fileDiff({ path, oldPath = path, status = "modified", removed = [], added = [], start = 10 }) {
	const lines = [`diff --git a/${oldPath} b/${path}`];
	if (status === "added") lines.push("new file mode 100644");
	if (status === "deleted") lines.push("deleted file mode 100644");
	if (status === "renamed") lines.push("similarity index 90%", `rename from ${oldPath}`, `rename to ${path}`);
	lines.push(`--- ${status === "added" ? "/dev/null" : `a/${oldPath}`}`, `+++ ${status === "deleted" ? "/dev/null" : `b/${path}`}`);
	if (removed.length > 0 || added.length > 0) {
		lines.push(`@@ -${status === "added" ? 0 : start},${removed.length} +${status === "deleted" ? 0 : start},${added.length} @@`);
		lines.push(...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`));
	}
	return `${lines.join("\n")}\n`;
}

export const cleanDiff = fileDiff({ path: "src/price.js", removed: ["return a + b;"], added: ["return Number(a) + Number(b);"] })
	+ fileDiff({ path: "src/price.test.js", removed: ["expect(add(1, 2)).toBe(3);"], added: ["expect(add(1, 2)).toBe(3);", "expect(add('1', 2)).toBe(3);"] });

export function tempRepo() {
	const dir = mkdtempSync(join(tmpdir(), "control-guard-"));
	const git = (...args) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	git("init", "-q", "-b", "main");
	const repo = {
		dir,
		git,
		write(path, content) {
			mkdirSync(dirname(join(dir, path)), { recursive: true });
			writeFileSync(join(dir, path), content);
		},
		remove(path) {
			rmSync(join(dir, path), { force: true });
		},
		commit(message, files = {}, deletes = []) {
			for (const [path, content] of Object.entries(files)) repo.write(path, content);
			for (const path of deletes) repo.remove(path);
			git("add", "-A");
			git("commit", "-q", "-m", message);
			return git("rev-parse", "HEAD").trim();
		},
		cleanup() {
			rmSync(dir, { recursive: true, force: true });
		},
	};
	return repo;
}
