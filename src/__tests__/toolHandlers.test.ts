import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NasebanalClient } from '@nasebanal/sdk';
import { registerTargetTools } from '../mcp/tools/target';
import { registerRecorderTools } from '../mcp/tools/recorder';

type Handler = (input: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
interface Registered {
  schema: z.ZodObject<z.ZodRawShape>;
  handler: Handler;
}

// Registers every tool against a fake server and a fake SDK client, so a test can validate
// input the way the MCP layer does (the Zod shape) and then run the handler.
function setup(nb: unknown) {
  const tools = new Map<string, Registered>();
  const server = {
    registerTool: (name: string, config: { inputSchema: z.ZodRawShape }, handler: Handler) =>
      void tools.set(name, { schema: z.object(config.inputSchema), handler }),
  } as unknown as McpServer;
  registerTargetTools(server, nb as NasebanalClient);
  registerRecorderTools(server, nb as NasebanalClient);
  return (name: string) => tools.get(name)!;
}

describe('sharing tools require explicit confirmation', () => {
  const valid = { shared_with_email: 'a@example.com', permission: 'read' as const };

  it('target_share_create rejects input without confirm: true', () => {
    const tool = setup({})('target_share_create');
    const input = { ...valid, target_id: 't1' };
    expect(tool.schema.safeParse(input).success).toBe(false);
    expect(tool.schema.safeParse({ ...input, confirm: false }).success).toBe(false);
    expect(tool.schema.safeParse({ ...input, confirm: true }).success).toBe(true);
  });

  it('recorder_share_create rejects input without confirm: true', () => {
    const tool = setup({})('recorder_share_create');
    const input = { ...valid, tag_id: null };
    expect(tool.schema.safeParse(input).success).toBe(false);
    expect(tool.schema.safeParse({ ...input, confirm: true }).success).toBe(true);
  });

  it('does not forward the confirm flag to the API', async () => {
    const create = vi.fn().mockResolvedValue({ success: true });
    const tool = setup({ target: { shares: { create } } })('target_share_create');
    await tool.handler({ confirm: true, target_id: 't1', ...valid });
    expect(create).toHaveBeenCalledWith({ target_id: 't1', ...valid });
  });
});

describe('target_set_parent', () => {
  it('requires parent_target_id, so an omitted field cannot move a Target to the top level', () => {
    const tool = setup({})('target_set_parent');
    expect(tool.schema.safeParse({ id: 't1' }).success).toBe(false);
    expect(tool.schema.safeParse({ id: 't1', parent_target_id: null }).success).toBe(true);
    expect(tool.schema.safeParse({ id: 't1', parent_target_id: 'p1' }).success).toBe(true);
  });

  it('passes an explicit null through', async () => {
    const parent = vi.fn().mockResolvedValue({});
    const tool = setup({ target: { targets: { parent } } })('target_set_parent');
    await tool.handler({ id: 't1', parent_target_id: null });
    expect(parent).toHaveBeenCalledWith('t1', { parent_target_id: null });
  });
});

describe('target_cell_update', () => {
  it('sends the position as the string the SDK expects', async () => {
    const replace = vi.fn().mockResolvedValue({});
    const tool = setup({ target: { targets: { cells: { replace } } } })('target_cell_update');
    await tool.handler({ id: 't1', position: 3, progress: 50 });
    expect(replace).toHaveBeenCalledWith('t1', '3', { text: undefined, progress: 50 });
  });

  it('rejects a negative or fractional position', () => {
    const tool = setup({})('target_cell_update');
    expect(tool.schema.safeParse({ id: 't1', position: -1 }).success).toBe(false);
    expect(tool.schema.safeParse({ id: 't1', position: 1.5 }).success).toBe(false);
  });
});

describe('recorder_record_export', () => {
  const run = (csv: string) => {
    const get = vi.fn().mockResolvedValue(csv);
    const tool = setup({ recorder: { records: { export: { get } } } })('recorder_record_export');
    return tool.handler({ name: 'Weight' }).then((r) => ({ text: r.content[0].text, get }));
  };

  it('returns a short CSV untouched', async () => {
    const { text, get } = await run('name,value\nWeight,70');
    expect(text).toBe('name,value\nWeight,70');
    expect(get).toHaveBeenCalledWith({ name: 'Weight' });
  });

  it('cuts an oversized CSV off and says so', async () => {
    const { text } = await run('x'.repeat(100_001));
    expect(text.startsWith('x'.repeat(100_000))).toBe(true);
    expect(text).toContain('[truncated: 100001 characters in total');
  });
});

describe('update tools', () => {
  it('recorder_goal_update sends only the body, with the id as the path argument', async () => {
    const replace = vi.fn().mockResolvedValue({});
    const tool = setup({ recorder: { goals: { replace } } })('recorder_goal_update');
    await tool.handler({ id: '7', goal_value: 80 });
    expect(replace).toHaveBeenCalledWith('7', { goal_value: 80 });
  });

  it('recorder_tag_update accepts a null unit (clearing it) but rejects an unknown chart type', () => {
    const tool = setup({})('recorder_tag_update');
    expect(tool.schema.safeParse({ id: '1', unit: null }).success).toBe(true);
    expect(tool.schema.safeParse({ id: '1', chart_type: 'pie' }).success).toBe(false);
  });
});
