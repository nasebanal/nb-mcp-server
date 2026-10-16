import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NasebanalClient } from '@nasebanal/sdk';

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export const recordCreateSchema = {
  name: z.string().min(1).describe('Tag/series name, e.g. "Weight" or "Pushups". Auto-creates the tag if it does not exist yet.'),
  value: z.number(),
  unit: z.string().optional(),
  recorded_at: z.string().optional().describe('ISO 8601 timestamp; defaults to now'),
};

export const recordUpdateSchema = {
  id: z.string().min(1).describe('Record id'),
  name: z.string().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  recorded_at: z.string().optional(),
};

export const goalCreateSchema = {
  tag_id: z.number().describe('Numeric Tag id (use recorder_tag_list to find it) — Goals cannot auto-create a tag by name.'),
  goal_type: z.enum(['goal_value', 'habit']),
  goal_value: z.number().optional(),
  direction: z.enum(['above', 'below']).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  goal_count: z.number().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  comment: z.string().optional(),
};

// A CSV export can be arbitrarily large; an MCP tool result that big is useless to the model.
const EXPORT_MAX_CHARS = 100_000;

export const goalUpdateSchema = {
  id: z.string().min(1).describe('Goal id (use recorder_goal_list to find it)'),
  tag_id: z.number().optional(),
  goal_type: z.enum(['goal_value', 'habit']).optional(),
  goal_value: z.number().optional(),
  direction: z.enum(['above', 'below']).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  goal_count: z.number().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  comment: z.string().optional(),
};

export const tagUpdateSchema = {
  id: z.string().min(1).describe('Tag id (use recorder_tag_list to find it)'),
  name: z.string().min(1).optional(),
  unit: z.string().nullable().optional(),
  chart_type: z.enum(['line', 'smooth', 'step']).optional(),
  data_type: z.enum(['binary', 'decimal', 'integer', 'time']).optional(),
};

export const recordExportSchema = {
  name: z.string().optional().describe('Limit to one tag/series name'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
};

// Sharing emails the recipient and gives them access to the data, so the tool refuses to
// run unless the caller passes confirm: true, which it should do only after the user has
// approved this specific share.
export const recorderShareCreateSchema = {
  confirm: z
    .literal(true)
    .describe('Must be true. Set it only after the user has approved sharing this data with this person.'),
  shared_with_email: z.string().email().describe('Recipient email address'),
  permission: z.enum(['read', 'write']),
  tag_id: z
    .number()
    .nullable()
    .describe('Numeric Tag id to share just that series, or null to share all of the user\'s data'),
};

const shareStatus = z.enum(['accepted', 'pending', 'rejected', 'all']).optional();

export function registerRecorderTools(server: McpServer, nb: NasebanalClient) {
  server.registerTool(
    'recorder_record_list',
    {
      description: 'List logged data points, optionally filtered by tag name and/or date range.',
      inputSchema: {
        name: z.string().optional().describe('Filter to one tag/series name'),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      },
    },
    async (query) => json(await nb.recorder.records.list(query))
  );

  server.registerTool(
    'recorder_record_create',
    {
      description: 'Log a new data point. If `name` does not match an existing tag, Recorder auto-creates one.',
      inputSchema: recordCreateSchema,
    },
    async (input) => json(await nb.recorder.records.create(input))
  );

  server.registerTool(
    'recorder_record_update',
    {
      description: 'Update an existing logged data point by id.',
      inputSchema: recordUpdateSchema,
    },
    async ({ id, ...body }) => json(await nb.recorder.records.replace(id, body))
  );

  server.registerTool(
    'recorder_tag_list',
    {
      description:
        'List all tags (series) the current user has. Use this to resolve a tag\'s numeric id before calling recorder_goal_create.',
      inputSchema: {},
    },
    async () => json(await nb.recorder.tags.list())
  );

  server.registerTool(
    'recorder_goal_list',
    {
      description: 'List all Goals for the current user.',
      inputSchema: {},
    },
    async () => json(await nb.recorder.goals.list())
  );

  server.registerTool(
    'recorder_goal_create',
    {
      description: 'Create a new Goal (a target value or habit-frequency) attached to an existing Tag.',
      inputSchema: goalCreateSchema,
    },
    async (input) => json(await nb.recorder.goals.create(input))
  );

  server.registerTool(
    'recorder_stats',
    {
      description:
        'Get summary statistics (count/min/max/average/latest) for a named tag — use this to build a report.',
      inputSchema: { name: z.string().min(1).describe('Tag/series name') },
    },
    async ({ name }) => json(await nb.recorder.records.stats.list({ name }))
  );

  server.registerTool(
    'recorder_record_get',
    {
      description: 'Get a single logged data point by id.',
      inputSchema: { id: z.string().min(1).describe('Record id') },
    },
    async ({ id }) => json(await nb.recorder.records.get(id))
  );

  server.registerTool(
    'recorder_record_export',
    {
      description: `Export logged data points as CSV text, optionally filtered by tag name and/or date range. Output is cut off at ${EXPORT_MAX_CHARS} characters; narrow the filters if it is.`,
      inputSchema: recordExportSchema,
    },
    async (query) => {
      const csv = String(await nb.recorder.records.export.get(query));
      const truncated = csv.length > EXPORT_MAX_CHARS;
      const body = truncated ? csv.slice(0, EXPORT_MAX_CHARS) : csv;
      const note = truncated ? `\n[truncated: ${csv.length} characters in total; narrow the filters]` : '';
      return { content: [{ type: 'text' as const, text: body + note }] };
    }
  );

  server.registerTool(
    'recorder_goal_progress',
    {
      description: 'Get the current progress of every Goal (current value, whether it is met, percentage).',
      inputSchema: {},
    },
    async () => json(await nb.recorder.goals.progress.get())
  );

  server.registerTool(
    'recorder_goal_update',
    {
      description: 'Update an existing Goal. Only the fields you pass are changed.',
      inputSchema: goalUpdateSchema,
    },
    async ({ id, ...body }) => json(await nb.recorder.goals.replace(id, body))
  );

  server.registerTool(
    'recorder_tag_update',
    {
      description: 'Update a tag (series): its name, unit, chart type or data type. Only the fields you pass are changed.',
      inputSchema: tagUpdateSchema,
    },
    async ({ id, ...body }) => json(await nb.recorder.tags.replace(id, body))
  );

  server.registerTool(
    'recorder_share_list',
    {
      description: 'List the shares the current user has created for their own data.',
      inputSchema: {},
    },
    async () => json(await nb.recorder.shares.list())
  );

  server.registerTool(
    'recorder_share_with_me_list',
    {
      description: 'List the share invitations addressed to the current user. Defaults to accepted shares.',
      inputSchema: { status: shareStatus },
    },
    async (query) => json(await nb.recorder.shares.withMe.get(query))
  );

  server.registerTool(
    'recorder_shared_graph_list',
    {
      description: 'List the public shared graphs the current user has created.',
      inputSchema: {},
    },
    async () => json(await nb.recorder.sharedGraphs.list())
  );

  server.registerTool(
    'recorder_share_create',
    {
      description:
        'Share Recorder data with another person by email. This sends them an invitation and gives them access to the data, so ask the user to approve the exact recipient, permission and scope first, then call with confirm: true.',
      inputSchema: recorderShareCreateSchema,
    },
    async ({ confirm: _confirm, ...body }) => json(await nb.recorder.shares.create(body))
  );
}
