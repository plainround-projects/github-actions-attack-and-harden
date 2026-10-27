import { main } from "./interfaces/cli.js";

process.exitCode = main({ env: process.env, stdout: process.stdout, stderr: process.stderr });
