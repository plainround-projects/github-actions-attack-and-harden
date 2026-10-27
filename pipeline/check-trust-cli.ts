import { readFileSync } from "node:fs";
import { evaluate, scenarios, type TrustPolicy } from "./trust-policy.js";

/**
 * usage: tsx pipeline/check-trust-cli.ts PLAN.json OWNER/REPO ENVIRONMENT
 * PLAN.json comes from `terraform show -json PLAN`. Exits 1 if any scenario gets a different answer than expected.
 */
const [planFile, repository, environment] = process.argv.slice(2);
if (!planFile || !repository || !environment) {
  console.error("usage: check-trust-cli.ts PLAN.json OWNER/REPO ENVIRONMENT");
  process.exit(2);
}

interface PlannedResource {
  readonly type: string;
  readonly values: { readonly assume_role_policy?: string; readonly url?: string };
}
interface Plan {
  readonly planned_values: { readonly root_module: Module };
}
interface Module {
  readonly resources?: PlannedResource[];
  readonly child_modules?: Module[];
}

function* resourcesOf(module: Module): Generator<PlannedResource> {
  yield* module.resources ?? [];
  for (const child of module.child_modules ?? []) yield* resourcesOf(child);
}

const plan = JSON.parse(readFileSync(planFile, "utf8")) as Plan;
const resources = [...resourcesOf(plan.planned_values.root_module)];
const role = resources.find((resource) => resource.type === "aws_iam_role");
const provider = resources.find((resource) => resource.type === "aws_iam_openid_connect_provider");
if (!role?.values.assume_role_policy) {
  console.error("check-trust: the plan has no aws_iam_role with a known assume_role_policy");
  process.exit(2);
}

const policy = JSON.parse(role.values.assume_role_policy) as TrustPolicy;
const federated = policy.Statement[0]?.Principal.Federated;
const providerArn = Array.isArray(federated) ? federated[0] : federated;
const host = (provider?.values.url ?? "https://token.actions.githubusercontent.com").replace(/^https:\/\//, "");
if (!providerArn) {
  console.error("check-trust: the trust policy names no federated principal");
  process.exit(2);
}

let mismatches = 0;
for (const scenario of scenarios(repository, environment)) {
  const decision = evaluate(policy, scenario.token, host, providerArn);
  const ok = decision.allowed === scenario.expected;
  if (!ok) mismatches += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${decision.allowed ? "ASSUMED" : "REFUSED"}  ${scenario.name}  [${scenario.token.sub}]  ${decision.reason}`,
  );
}
console.log(
  mismatches === 0
    ? "check-trust: the trust policy behaves as intended"
    : `check-trust: ${mismatches} scenario(s) differ`,
);
process.exit(mismatches === 0 ? 0 : 1);
