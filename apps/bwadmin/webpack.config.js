const path = require("path");
const { buildConfig } = require("../cli/webpack.base");

module.exports = (webpackConfig, context) => {
  const mode = context.options.mode || "development";
  if (process.env.NODE_ENV == null) {
    process.env.NODE_ENV = mode;
  }
  const ENV = (process.env.ENV = process.env.NODE_ENV);

  const config = buildConfig({
    configName: "OSS",
    entry: context.options.main || "apps/bwadmin/src/bwadmin.ts",
    tsConfig: "tsconfig.base.json",
    outputPath: path.resolve(context.context.root, context.options.outputPath),
    mode: mode,
    env: ENV,
    modulesPath: [path.resolve("node_modules")],
    localesPath: "apps/cli/src/locales",
    externalsModulesDir: "node_modules",
    watch: context.options.watch || false,
  });

  config.output.filename = "bwadmin.js";
  return config;
};
