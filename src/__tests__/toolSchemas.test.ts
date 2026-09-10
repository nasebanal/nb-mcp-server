import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { targetCreateSchema, targetUpdateSchema } from '../mcp/tools/target';
import { goalCreateSchema, recordCreateSchema, recordUpdateSchema } from '../mcp/tools/recorder';

describe('target_create schema', () => {
  const schema = z.object(targetCreateSchema);

  it('accepts a minimal valid input', () => {
    expect(schema.safeParse({ title: 'Learn TypeScript' }).success).toBe(true);
  });

  it('accepts a sub-target with parent_id', () => {
    expect(schema.safeParse({ title: 'Sub target', parent_id: 'abc123' }).success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(schema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects a missing title', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('target_update schema', () => {
  const schema = z.object(targetUpdateSchema);

  it('requires an id', () => {
    expect(schema.safeParse({ title: 'New title' }).success).toBe(false);
    expect(schema.safeParse({ id: 't1', title: 'New title' }).success).toBe(true);
  });
});

describe('recorder_record_create schema', () => {
  const schema = z.object(recordCreateSchema);

  it('accepts name + value', () => {
    expect(schema.safeParse({ name: 'Weight', value: 70.5 }).success).toBe(true);
  });

  it('rejects a non-numeric value', () => {
    expect(schema.safeParse({ name: 'Weight', value: '70.5' }).success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(schema.safeParse({ value: 1 }).success).toBe(false);
  });
});

describe('recorder_record_update schema', () => {
  const schema = z.object(recordUpdateSchema);

  it('requires an id but nothing else', () => {
    expect(schema.safeParse({ id: 'r1' }).success).toBe(true);
    expect(schema.safeParse({ value: 1 }).success).toBe(false);
  });
});

describe('recorder_goal_create schema', () => {
  const schema = z.object(goalCreateSchema);

  it('accepts a minimal valid goal', () => {
    expect(schema.safeParse({ tag_id: 42, goal_type: 'goal_value' }).success).toBe(true);
  });

  it('rejects a non-numeric tag_id', () => {
    expect(schema.safeParse({ tag_id: '42', goal_type: 'goal_value' }).success).toBe(false);
  });

  it('rejects an invalid goal_type', () => {
    expect(schema.safeParse({ tag_id: 1, goal_type: 'bogus' }).success).toBe(false);
  });

  it('rejects an invalid direction', () => {
    expect(schema.safeParse({ tag_id: 1, goal_type: 'goal_value', direction: 'sideways' }).success).toBe(false);
  });
});
