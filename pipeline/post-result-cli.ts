import { readFileSync } from "node:fs";
import { InvalidResultError, parseResult, renderComment } from "./build-result.js";
import { GitHubComments, upsertComment } from "./github-comments.js";

const [file] = process.argv.slice(2);
const token = process.env["GITHUB_TOKEN"];
const repository = process.env["GITHUB_REPOSITORY"];

if (!file || !token || !repository) {
  console.error("usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name post-result-cli.ts RESULT.json");
  process.exit(2);
}

try {
  const result = parseResult(readFileSync(file, "utf8"));
  const action = await upsertComment(new GitHubComments({ token }), repository, result.pr, renderComment(result));
  console.log(`pr-report: ${action} the comment on pull request ${result.pr} (${result.conclusion})`);
} catch (error) {
  if (error instanceof InvalidResultError) {
    console.error(`pr-report: refusing the result: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
