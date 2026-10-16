// Which contract operation (nb-api-specs `operationId`) each MCP tool exposes,
// and which operations are deliberately NOT exposed. `src/__tests__/operationCoverage.test.ts`
// checks this against the pinned `@nasebanal/api-specs-*` contracts, so a Bump PR that adds
// an operation fails CI until it is either given a tool or listed below with a reason.
//
// `operationId` is only unique within one spec (`getHealth`, `createShare` exist in both),
// so every entry is keyed by spec + operationId.

export type SpecName = 'target' | 'recorder';

export interface OperationRef {
  spec: SpecName;
  operationId: string;
}

/** Tool name -> the single contract operation it calls. */
export const TOOL_OPERATIONS: Record<string, OperationRef> = {
  target_list: { spec: 'target', operationId: 'listTargets' },
  target_get: { spec: 'target', operationId: 'getTarget' },
  target_create: { spec: 'target', operationId: 'createTarget' },
  target_update: { spec: 'target', operationId: 'updateTarget' },
  target_delete: { spec: 'target', operationId: 'deleteTarget' },
  target_cell_update: { spec: 'target', operationId: 'updateTargetCell' },
  target_set_parent: { spec: 'target', operationId: 'setTargetParent' },
  target_shared_list: { spec: 'target', operationId: 'listSharedTargets' },
  target_share_list: { spec: 'target', operationId: 'listMyShares' },
  target_share_with_me_list: { spec: 'target', operationId: 'listSharesWithMe' },
  target_share_create: { spec: 'target', operationId: 'createShare' },
  recorder_record_list: { spec: 'recorder', operationId: 'getRecords' },
  recorder_record_create: { spec: 'recorder', operationId: 'createRecord' },
  recorder_record_update: { spec: 'recorder', operationId: 'updateRecord' },
  recorder_tag_list: { spec: 'recorder', operationId: 'getTags' },
  recorder_goal_list: { spec: 'recorder', operationId: 'getGoals' },
  recorder_goal_create: { spec: 'recorder', operationId: 'createGoal' },
  recorder_stats: { spec: 'recorder', operationId: 'getRecordStats' },
  recorder_record_get: { spec: 'recorder', operationId: 'getRecord' },
  recorder_record_export: { spec: 'recorder', operationId: 'exportRecords' },
  recorder_goal_progress: { spec: 'recorder', operationId: 'getGoalProgress' },
  recorder_goal_update: { spec: 'recorder', operationId: 'updateGoal' },
  recorder_tag_update: { spec: 'recorder', operationId: 'updateTag' },
  recorder_share_list: { spec: 'recorder', operationId: 'getMyShares' },
  recorder_share_with_me_list: { spec: 'recorder', operationId: 'getSharedWithMe' },
  recorder_shared_graph_list: { spec: 'recorder', operationId: 'getMySharedGraphs' },
  recorder_share_create: { spec: 'recorder', operationId: 'createShare' },
};

export interface UnexposedOperation extends OperationRef {
  reason: string;
}

function excluded(spec: SpecName, reason: string, operationIds: string[]): UnexposedOperation[] {
  return operationIds.map((operationId) => ({ spec, operationId, reason }));
}

const NO_USE = 'The MCP session is already authenticated; nothing for an agent to do with it';
const EMAIL_TOKEN = 'Redeems a token from an emailed link: a screen flow, not an agent task';
const COUNTERPARTY = 'Involves another party (consent, ownership transfer) and is hard to undo';
const VISIBILITY = 'Changes who can see the data (privacy); keep it a deliberate human action';
const BULK_DELETE = 'Bulk delete: blast radius too large for an agent tool';
const PUBLISH = 'Publishes data on a public URL';
const BINARY = 'Binary or unauthenticated payload, a poor fit for a text-only MCP tool';
const DELETE_REVISIT =
  'Single delete: held back for now. target_delete is exposed, so decide whether to align the two';

/**
 * Every operation deliberately without a tool. Each entry needs a reason; the coverage test fails on an
 * operation that is neither a tool nor listed here, and on an entry that no longer exists
 * in the contract.
 */
export const UNEXPOSED_OPERATIONS: UnexposedOperation[] = [
  // --- target ---
  ...excluded('target', NO_USE, ['getHealth', 'getCurrentUser']),
  ...excluded('target', EMAIL_TOKEN, ['acceptShareByToken', 'acceptMigrationByToken']),
  ...excluded('target', COUNTERPARTY, [
    'acceptShareById',
    'rejectShare',
    'deleteShare',
    'transferOwnership',
    'acceptMigrationById',
    'rejectMigration',
    'cancelMigration',
    'getRecipientContextOptions',
  ]),
  ...excluded('target', VISIBILITY, ['toggleShareVisibility', 'toggleSharePaused']),

  // --- recorder ---
  ...excluded('recorder', NO_USE, ['getHealth', 'getCurrentUser']),
  ...excluded('recorder', EMAIL_TOKEN, ['acceptShare', 'rejectShareByToken']),
  ...excluded('recorder', COUNTERPARTY, ['updateShare', 'deleteShare', 'rejectShare', 'transferShareOwnership']),
  ...excluded('recorder', VISIBILITY, [
    'toggleRecordVisibility',
    'toggleTagVisibility',
    'toggleGoalVisibility',
    'toggleShareVisibility',
    'toggleSharePaused',
  ]),
  ...excluded('recorder', BULK_DELETE, [
    'bulkDeleteRecords',
    'bulkDeleteTags',
    'bulkDeleteGoals',
    'bulkDeleteShares',
    'bulkDeleteSharedGraphs',
  ]),
  ...excluded('recorder', PUBLISH, [
    'createSharedGraph',
    'updateSharedGraph',
    'deleteSharedGraph',
    'toggleSharedGraphActive',
  ]),
  ...excluded('recorder', BINARY, [
    'getPublicSharedGraph',
    'getSharedGraphOgImage',
    'uploadMedia',
    'getMediaUploadUrl',
    'getMediaSignedUrl',
    'deleteMedia',
  ]),
  ...excluded('recorder', 'Bulk import: a mistaken call is expensive to clean up', ['importRecords']),
  ...excluded('recorder', DELETE_REVISIT, ['deleteRecord', 'deleteGoal', 'deleteTag']),
];
