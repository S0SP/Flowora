import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "flowora",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300, 
  dirs: ["src/trigger"],
});
