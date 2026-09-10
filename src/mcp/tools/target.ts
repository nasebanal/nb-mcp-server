import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NasebanalClient } from '@nasebanal/sdk';

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export const targetCreateSchema = {
  title: z.string().min(1).describe('Target title'),
  description: z.string().optional(),
  memo: z.string().optional(),
  parent_id: z.string().optional().describe('Parent Target id, to create a sub-target'),
};

export const targetUpdateSchema = {
  id: z.string().min(1).describe('Target id'),
  title: z.string().optional(),
  description: z.string().optional(),
  memo: z.string().optional(),
};

export function registerTargetTools(server: McpServer, nb: NasebanalClient) {
  server.registerTool(
    'target_list',
    {
      description: 'List all of the current user\'s Targets, with their nested cell data.',
      inputSchema: {},
    },
    async () => json(await nb.target.targets.list())
  );

  server.registerTool(
    'target_get',
    {
      description: 'Get a single Target by id, including its cells.',
      inputSchema: { id: z.string().min(1).describe('Target id') },
    },
    async ({ id }) => json(await nb.target.targets.get(id))
  );

  server.registerTool(
    'target_create',
    {
      description:
        'Create a new Target for the current user. A Target is a hierarchical goal node; pass parent_id to nest it under an existing Target.',
      inputSchema: targetCreateSchema,
    },
    async ({ title, description, memo, parent_id }) =>
      json(await nb.target.targets.create({ title, description, memo, parent_id }))
  );

  server.registerTool(
    'target_update',
    {
      description: 'Update an existing Target\'s title, description, or memo.',
      inputSchema: targetUpdateSchema,
    },
    async ({ id, title, description, memo }) => json(await nb.target.targets.replace(id, { title, description, memo }))
  );

  server.registerTool(
    'target_delete',
    {
      description: 'Delete a Target by id.',
      inputSchema: { id: z.string().min(1).describe('Target id') },
    },
    async ({ id }) => json(await nb.target.targets.delete(id))
  );
}
