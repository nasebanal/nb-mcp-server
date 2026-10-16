/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NasebanalClient } from '@nasebanal/sdk';
import { registerTargetTools } from '../mcp/tools/target';
import { registerRecorderTools } from '../mcp/tools/recorder';
import { TOOL_OPERATIONS, UNEXPOSED_OPERATIONS, type SpecName } from '../mcp/operations';
import targetSpec from '@nasebanal/api-specs-target/spec.yaml?raw';
import recorderSpec from '@nasebanal/api-specs-recorder/spec.yaml?raw';

const SPECS: SpecName[] = ['target', 'recorder'];
const SPEC_TEXT: Record<SpecName, string> = { target: targetSpec, recorder: recorderSpec };

// The pinned contracts (devDependencies, exact versions). Specs are YAML and the only thing
// read from them is `operationId`, so a line scan avoids a YAML dependency.
function specOperationIds(spec: SpecName): string[] {
  return [...SPEC_TEXT[spec].matchAll(/^\s+operationId:\s*['"]?([A-Za-z0-9_]+)['"]?\s*$/gm)].map((m) => m[1]);
}

function registeredToolNames(): string[] {
  const names: string[] = [];
  const server = { registerTool: (name: string) => void names.push(name) } as unknown as McpServer;
  const nb = {} as NasebanalClient;
  registerTargetTools(server, nb);
  registerRecorderTools(server, nb);
  return names;
}

const key = (spec: string, operationId: string) => `${spec}:${operationId}`;

describe('MCP tools vs. the pinned API contracts', () => {
  const specOps = new Map<SpecName, Set<string>>(SPECS.map((s) => [s, new Set(specOperationIds(s))]));
  const tools = registeredToolNames();

  it('reads at least one operationId from every contract (guards the scan itself)', () => {
    for (const spec of SPECS) {
      expect(specOps.get(spec)!.size, `${spec} spec`).toBeGreaterThan(0);
    }
  });

  it('maps every registered tool to an operation, and every mapping to a registered tool', () => {
    expect([...tools].sort()).toEqual(Object.keys(TOOL_OPERATIONS).sort());
  });

  it('maps tools only to operations that exist in the contract', () => {
    const missing = Object.entries(TOOL_OPERATIONS)
      .filter(([, op]) => !specOps.get(op.spec)!.has(op.operationId))
      .map(([tool, op]) => `${tool} -> ${key(op.spec, op.operationId)}`);
    expect(missing).toEqual([]);
  });

  it('gives each operation at most one tool', () => {
    const keys = Object.values(TOOL_OPERATIONS).map((op) => key(op.spec, op.operationId));
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('lists only operations that exist in the contract (no stale entries)', () => {
    const stale = UNEXPOSED_OPERATIONS.filter((e) => !specOps.get(e.spec)!.has(e.operationId)).map((e) =>
      key(e.spec, e.operationId)
    );
    expect(stale).toEqual([]);
  });

  it('never lists an operation twice, or both as a tool and as unexposed', () => {
    const exposed = new Set(Object.values(TOOL_OPERATIONS).map((op) => key(op.spec, op.operationId)));
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const e of UNEXPOSED_OPERATIONS) {
      const k = key(e.spec, e.operationId);
      if (exposed.has(k)) problems.push(`${k} is a tool and also listed as unexposed`);
      if (seen.has(k)) problems.push(`${k} is listed twice`);
      seen.add(k);
    }
    expect(problems).toEqual([]);
  });

  it('requires a reason on every unexposed operation', () => {
    const blank = UNEXPOSED_OPERATIONS.filter((e) => e.reason.trim() === '').map((e) =>
      key(e.spec, e.operationId)
    );
    expect(blank).toEqual([]);
  });

  it('accounts for every operation in the contract: a tool, or a listed reason', () => {
    const accounted = new Set([
      ...Object.values(TOOL_OPERATIONS).map((op) => key(op.spec, op.operationId)),
      ...UNEXPOSED_OPERATIONS.map((e) => key(e.spec, e.operationId)),
    ]);
    const unaccounted = SPECS.flatMap((spec) =>
      [...specOps.get(spec)!].filter((id) => !accounted.has(key(spec, id))).map((id) => key(spec, id))
    );
    // A new operation arrived with a contract bump. Either register a tool for it in
    // src/mcp/tools/ and add it to TOOL_OPERATIONS, or add it to UNEXPOSED_OPERATIONS
    // in src/mcp/operations.ts with the reason it is not exposed.
    expect(unaccounted).toEqual([]);
  });
});
