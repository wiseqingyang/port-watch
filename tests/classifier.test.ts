import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyService } from '../src/classifier.js';
import { redactCommand } from '../src/redaction.js';
import { buildFileSystemTree } from '../frontend/src/utils/grouping.js';
import { parsePort } from '../src/cli.js';
import { service } from './fixtures.js';

const classify = (command: string, cwd = '/tmp/project', port = 3000) => classifyService({ pid: 2, processName: 'node', command, cwd, ports: [port] });
test('classification does not use ancestor directory names or common ports as proof', () => {
  assert.equal(classify('node /tmp/mcp-demo/node_modules/vite/bin/vite.js').framework, 'Vite');
  assert.equal(classify('node language-server.js', '/tmp/comfyui').framework, 'LSP');
  assert.equal(classify('node vite.js', '/tmp/project', 11434).framework, 'Vite');
  assert.equal(classify('python -m fastmcp').framework, 'MCP Server');
  assert.equal(classify('node /tmp/my-app/pyright.js').framework, 'LSP');
});

test('common credential forms are redacted without removing ordinary command arguments', () => {
  for (const command of ['node server.js --token super-secret', 'TOKEN=super-secret node server.js', 'node --password="super secret"', 'node --api-key=super-secret', 'node --url=https://user:super-secret@example.test', 'node --header "Authorization: Bearer super-secret"']) {
    const redacted = redactCommand(command);
    assert.ok(!redacted.includes('super-secret') && !redacted.includes('super secret'), redacted);
  }
  assert.equal(redactCommand('node server.js --port 3000'), 'node server.js --port 3000');
});

test('directory services are sorted even when callers provide unsorted input', () => {
  const tree = buildFileSystemTree([{ ...service, port: 9000 }, { ...service, port: 3000 }], 'port-asc');
  assert.deepEqual(tree?.children[0].directServices.map(item => item.port), [3000, 9000]);
});

test('CLI rejects malformed and out-of-range ports', () => {
  for (const input of ['123abc', '-1', '0', '65536', '1.5', '']) assert.throws(() => parsePort(input));
  assert.equal(parsePort('65535'), 65535);
});
