import { runCli } from './cli.js';

runCli().catch(error => {
  console.error('PortWatch:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
