// Git dates for content files, used when front matter has no `date` / `modified`:
// - gitCreated: the commit that added the file (following renames, like Eleventy's "git Created")
// - gitLastModified: the last commit that changed the file
// One `git log` per build for all files under src/. Both return undefined for an uncommitted file or outside
// a git checkout; callers then use the current date.
// Needs the full history: in GitHub Actions, checkout with `fetch-depth: 0`.
import { execFileSync } from "node:child_process";
import path from "node:path";

let created, modified;

// Called before every build, so the dev server picks up new commits on the next rebuild.
export function resetGitDates() {
  created = modified = undefined;
}

function load() {
  created = new Map();
  modified = new Map();
  let log = "";
  try {
    log = execFileSync(
      "git",
      ["-c", "core.quotepath=false", "log", "--reverse", "-M", "--format=%x00%aI", "--name-status", "--relative", "--", "src"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    return; // no git
  }
  // Oldest commit first. Lines: "\0<date>", then "A\tpath", "M\tpath", "D\tpath" or "R100\told\tnew".
  let date;
  for (const line of log.split("\n")) {
    if (line.startsWith("\0")) {
      date = line.slice(1);
      continue;
    }
    const [status, file, renamedTo] = line.split("\t");
    if (!file) continue;
    if (status === "A") created.set(file, created.get(file) ?? date);
    else if (status.startsWith("R")) created.set(renamedTo, created.get(file) ?? date);
    modified.set(renamedTo ?? file, date);
  }
}

const key = (inputPath) => path.relative(".", inputPath).split(path.sep).join("/");

export function gitCreated(inputPath) {
  if (!created) load();
  return created.get(key(inputPath));
}

export function gitLastModified(inputPath) {
  if (!modified) load();
  return modified.get(key(inputPath));
}
