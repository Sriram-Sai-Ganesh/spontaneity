import { spawnSync } from "node:child_process";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runFrontendTypecheck() {
  const result = spawnSync(
    pnpm,
    ["exec", "tsc", "-p", "tsconfig.app.json", "--noEmit"],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const srcErrors = output
    .split("\n")
    .filter((line) => line.startsWith("src/"))
    .join("\n")
    .trim();

  if (srcErrors) {
    console.error(srcErrors);
    return false;
  }

  return true;
}

const steps = [
  {
    name: "Frontend Typecheck",
    run: runFrontendTypecheck,
  },
  {
    name: "Convex Typecheck",
    args: ["exec", "tsc", "-p", "convex/tsconfig.json", "--noEmit"],
  },
  {
    name: "Convex Test Suite",
    args: ["run", "test:convex"],
  },
  {
    name: "Frontend Test Suite",
    args: ["run", "test:frontend"],
  },
];

const failures = [];
const skipped = [];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const result = step.run
    ? await step.run()
    : spawnSync(pnpm, step.args, {
        cwd: process.cwd(),
        stdio: "inherit",
        env: process.env,
      }).status === 0;

  if (result === "skipped") {
    skipped.push(step.name);
  } else if (!result) {
    failures.push(step.name);
  }
}

if (failures.length > 0) {
  console.error("\nTeam-wide verification failed.");
  for (const failure of failures) {
    console.error(`  FAIL: ${failure}`);
  }
  for (const skip of skipped) {
    console.error(`  SKIP: ${skip}`);
  }
  process.exit(1);
}

if (skipped.length > 0) {
  console.log("\nTeam-wide verification passed (with skips).");
  for (const skip of skipped) {
    console.log(`  SKIP: ${skip}`);
  }
} else {
  console.log("\nTeam-wide verification passed.");
}
