/* eslint-disable @typescript-eslint/no-require-imports */

////
// Runs the locally built bwadmin CLI against an isolated state directory, so debugging never
// touches the host's real Bitwarden CLI installation.
//
//   .debug/bwadmin-profile/   app data (session, vault cache, config)
//
// The bundle is rebuilt on every invocation, unless NO_BUILD is set.
//
// Usage: npm run debug:bwadmin -- --version
//        NO_BUILD=1 npm run debug:bwadmin -- serve --help
////

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const inspect = args[0] === "--inspect";
if (inspect) {
  args.shift();
}

const BWADMIN_DIR = path.resolve(__dirname, "..");
const DEBUG_DIR = path.resolve(BWADMIN_DIR, "../..", ".debug");
const BUNDLE = path.resolve(BWADMIN_DIR, "../..", "dist/apps/bwadmin/oss-dev/bwadmin.js");
// Node >= 18.20 refuses to spawn .cmd files without a shell, so invoke npm's CLI entry directly.
const NPM_CLI = path.join(
  path.dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
const NO_BUILD = process.env.NO_BUILD === "1" || process.env.NO_BUILD === "true";

const environment = {
  ...process.env,
  BITWARDENCLI_APPDATA_DIR: path.join(DEBUG_DIR, "bwadmin-profile"),
};

fs.mkdirSync(environment.BITWARDENCLI_APPDATA_DIR, { recursive: true });

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: BWADMIN_DIR,
    env: environment,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

// Rebuild so the run never silently uses a stale bundle. NO_BUILD trades that guarantee for a
// fast start, when the bundle is known to be current.
if (!NO_BUILD) {
  const buildStatus = run(process.execPath, [NPM_CLI, "run", "build"]);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }
} else if (!fs.existsSync(BUNDLE)) {
  throw new Error(`NO_BUILD is set but ${BUNDLE} does not exist. Run without NO_BUILD once.`);
}

const nodeArgs = inspect ? ["--inspect", BUNDLE, ...args] : [BUNDLE, ...args];
process.exit(run(process.execPath, nodeArgs));
