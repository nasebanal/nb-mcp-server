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

const shareStatus = z.enum(['accepted', 'pending', 'rejected', 'all']).optional();

export const targetCellUpdateSchema = {
  id: z.string().min(1).describe('Target id'),
  position: z.number().int().min(0).describe('Cell position within the Target'),
  text: z.string().optional(),
  progress: z.number().optional().describe('Progress of this cell'),
};

// `parent_target_id` is required-but-nullable on purpose: omitting it must not silently
// move a Target to the top level. Pass null explicitly to make it a root Target.
export const targetSetParentSchema = {
  id: z.string().min(1).describe('Target id to move'),
  parent_target_id: z
    .string()
    .min(1)
    .nullable()
    .describe('New parent Target id, or null to make this a top-level Target'),
};

// Sharing emails the recipient and makes the data visible to them, so the tool refuses to
// run unless the caller passes confirm: true, which it should do only after the user has
// approved this specific share.
export const targetShareCreateSchema = {
  confirm: z
    .literal(true)
    .describe('Must be true. Set it only after the user has approved sharing this Target with this person.'),
  target_id: z.string().min(1).describe('Target id to share'),
  shared_with_email: z.string().email().describe('Recipient email address'),
  permission: z.enum(['read', 'write']).optional().describe('Defaults to read when omitted'),
  include_descendants: z.boolean().optional().describe('Also share the sub-targets'),
  include_data: z.boolean().optional().describe('Also share the linked Recorder data'),
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

  server.registerTool(
    'target_cell_update',
    {
      description: 'Update the text and/or progress of one cell of a Target.',
      inputSchema: targetCellUpdateSchema,
    },
    async ({ id, position, text, progress }) =>
      json(await nb.target.targets.cells.replace(id, String(position), { text, progress }))
  );

  server.registerTool(
    'target_set_parent',
    {
      description:
        'Move a Target under another Target, or pass parent_target_id: null to make it a top-level Target.',
      inputSchema: targetSetParentSchema,
    },
    async ({ id, parent_target_id }) => json(await nb.target.targets.parent(id, { parent_target_id }))
  );

  server.registerTool(
    'target_shared_list',
    {
      description: 'List the Targets other people have shared with the current user (with their cells).',
      inputSchema: {},
    },
    async () => json(await nb.target.sharedTargets.list())
  );

  server.registerTool(
    'target_share_list',
    {
      description: 'List the shares the current user has created for their own Targets.',
      inputSchema: {},
    },
    async () => json(await nb.target.shares.list())
  );

  server.registerTool(
    'target_share_with_me_list',
    {
      description: 'List the share invitations addressed to the current user. Defaults to accepted shares.',
      inputSchema: { status: shareStatus },
    },
    async (query) => json(await nb.target.shares.withMe.get(query))
  );

  server.registerTool(
    'target_share_create',
    {
      description:
        'Share a Target with another person by email. This sends them an invitation and gives them access to the Target, so ask the user to approve the exact Target, recipient and permission first, then call with confirm: true.',
      inputSchema: targetShareCreateSchema,
    },
    async ({ confirm: _confirm, ...body }) => json(await nb.target.shares.create(body))
  );
}
