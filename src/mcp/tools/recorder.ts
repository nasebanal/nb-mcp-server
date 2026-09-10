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
}
