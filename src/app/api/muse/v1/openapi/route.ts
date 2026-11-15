import { CORE_PUBLISHING_CHANNELS } from '@/lib/domain/types'
import { MUSE_GOAL_MAX, MUSE_TEXT_MAX, MUSE_TITLE_MAX } from '@/lib/muse/connector'
import { MUSE_API_PATH, musePublicOrigin } from '@/lib/muse/links'

const count = { type: 'integer', minimum: 0 }
const uri = { type: 'string', format: 'uri' }
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})
const captured = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['seedId', 'created', 'url'],
        properties: { seedId: { type: 'string', format: 'uuid' }, created: { type: 'boolean' }, url: uri },
      },
    },
  },
})

export function GET(request: Request) {
  return Response.json({
    openapi: '3.1.0',
    info: {
      title: 'My-SNS for Muse',
      version: '1.0.0',
      description: 'Personal connector. Use a My-SNS Muse key for the selected workspace. Only read action counts or save an unapproved source note (Seed). No publishing, scheduling, approvals, or message content.',
    },
    servers: [{ url: new URL(MUSE_API_PATH, musePublicOrigin(request)).href }],
    security: [{ museKey: [] }],
    paths: {
      '/status': {
        get: {
          operationId: 'getMySnsStatus',
          summary: 'Read the counts of items needing attention in My-SNS',
          description: 'Read only. Returns action counts and links. duePosts is the number of scheduled posts at or past their scheduled time.',
          responses: {
            '200': {
              description: 'Workspace counts and My-SNS links',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['canCapture', 'counts', 'urls'],
                    properties: {
                      canCapture: { type: 'boolean' },
                      counts: {
                        type: 'object',
                        required: ['draftsToReview', 'failedPosts', 'duePosts', 'inboxNeedsAction'],
                        properties: { draftsToReview: count, failedPosts: count, duePosts: count, inboxNeedsAction: count },
                      },
                      urls: {
                        type: 'object',
                        required: ['home', 'drafts', 'queue', 'inbox'],
                        properties: { home: uri, drafts: uri, queue: uri, inbox: uri },
                      },
                    },
                  },
                },
              },
            },
            '401': errorResponse('Missing, expired or revoked key'),
            '503': errorResponse('Temporarily unavailable'),
          },
        },
      },
      '/seeds': {
        post: {
          operationId: 'captureMySnsSeed',
          summary: 'Save a new source note that the user can review in My-SNS',
          description: 'Write. Only when the user asks to save a source note. The note is captured and unapproved. Keep facts as supplied and do not alter existing notes. Generate one UUID per intended note and reuse the same requestId and payload if the outcome is uncertain. Maximum 30 new notes per workspace per hour; JSON body up to 64 KiB.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['requestId', 'title', 'sourceText'],
                  properties: {
                    requestId: { type: 'string', format: 'uuid', description: 'Stable idempotency key for this save' },
                    title: { type: 'string', minLength: 1, maxLength: MUSE_TITLE_MAX },
                    sourceText: { type: 'string', minLength: 1, maxLength: MUSE_TEXT_MAX, description: 'Original text and optional links; links are kept as text' },
                    goal: { type: 'string', minLength: 1, maxLength: MUSE_GOAL_MAX },
                    targetChannels: {
                      type: 'array',
                      minItems: 1,
                      maxItems: CORE_PUBLISHING_CHANNELS.length,
                      uniqueItems: true,
                      items: { type: 'string', enum: CORE_PUBLISHING_CHANNELS },
                      default: CORE_PUBLISHING_CHANNELS,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': captured('Already saved; same note returned'),
            '201': captured('New note saved; return its My-SNS review URL to the user'),
            '400': errorResponse('Invalid input'),
            '401': errorResponse('Missing, expired or revoked key'),
            '403': errorResponse('Read-only key'),
            '409': errorResponse('Request ID used for different content, or original note was deleted'),
            '413': errorResponse('Request body too large'),
            '415': errorResponse('Expected application/json'),
            '422': errorResponse('Set a Brand Profile at the returned My-SNS URL, then retry the same request'),
            '429': errorResponse('Hourly save limit reached'),
            '503': errorResponse('Temporarily unavailable; safely retry with the same requestId and payload'),
          },
        },
      },
    },
    components: {
      securitySchemes: { museKey: { type: 'http', scheme: 'bearer', description: 'Store the My-SNS key in Muse’s secure credentials store.' } },
      schemas: {
        Error: {
          type: 'object',
          required: ['code', 'error'],
          properties: { code: { type: 'string' }, error: { type: 'string' }, url: uri },
        },
      },
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
