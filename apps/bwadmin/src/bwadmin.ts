import "core-js/proposals/explicit-resource-management";

import { program } from "commander";

import { exitAfterCommand } from "@bitwarden/cli/exit-after-command";
import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";

import { AdminProgram } from "./admin.program";

async function main() {
  const serviceContainer = new ServiceContainer();
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    serviceContainer.dispose();
  };

  process.once("exit", dispose);

  try {
    await serviceContainer.init();

    await new AdminProgram(serviceContainer).register();

    await program.parseAsync(process.argv);
  } finally {
    process.removeListener("exit", dispose);
    dispose();
  }

  exitAfterCommand();
}

// Node does not support top-level await statements until ES2022, esnext, etc which we don't use yet
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
