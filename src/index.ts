import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import fetch from 'node-fetch'

const RUNPOD_API_BASE = 'https://rest.runpod.io/v1'
const USER_AGENT = 'runpod-mcp/1.0'

// Create server instance
const server = new McpServer({
  name: 'runpod',
  version: '1.0.0',
})

// Schema definitions
const ApiKeySchema = z.object({
  apiKey: z.string().min(1).describe('RunPod API key'),
})

// Pod schemas
const PodStatusSchema = z.enum([
  'ACTIVE',
  'TERMINATED',
  'PENDING',
  'EXITED',
  'FAILED',
  'STOPPING',
  'STOPPED',
])

const PodSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  gpuCount: z.number(),
  vcpuCount: z.number(),
  memoryInGb: z.number(),
  status: PodStatusSchema,
  volumeInGb: z.number().optional(),
  machine: z.string().optional(),
  costPerHr: z.number().optional(),
})

const PodListOutputSchema = z.object({
  pods: z.array(PodSchema),
})

const CreatePodInputSchema = z.object({
  gpuTypeId: z.string().describe('GPU type ID (e.g., NVIDIA_RTX_A5000)'),
  cloudType: z
    .enum(['SECURE', 'COMMUNITY'])
    .optional()
    .describe('Cloud type (SECURE or COMMUNITY)'),
  gpuCount: z.number().int().min(1).default(1).describe('Number of GPUs'),
  name: z.string().optional().describe('Name for the pod'),
  imageName: z.string().describe('Docker image to use'),
  containerDiskInGb: z
    .number()
    .int()
    .optional()
    .describe('Container disk size in GB'),
  volumeInGb: z.number().int().optional().describe('Volume size in GB'),
  minVcpuCount: z.number().int().optional().describe('Minimum vCPU count'),
  minMemoryInGb: z.number().int().optional().describe('Minimum memory in GB'),
  env: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      })
    )
    .optional()
    .describe('Environment variables'),
  ports: z
    .string()
    .optional()
    .describe('Ports to expose (e.g., "8888/http,22/tcp")'),
})

const CreatePodOutputSchema = z.object({
  id: z.string().describe('Pod ID'),
})

const PodIdInputSchema = z.object({
  podId: z.string().describe('Pod ID'),
})

// Serverless schemas
const ServerlessEndpointSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string(),
  workerId: z.string().optional(),
  gpuIds: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
})

const ServerlessEndpointListOutputSchema = z.object({
  endpoints: z.array(ServerlessEndpointSchema),
})

// Helper function to make API requests
async function makeApiRequest(
  apiKey: string,
  endpoint: string,
  method = 'GET',
  body?: any
) {
  const options: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
      'User-Agent': USER_AGENT,
    },
  }

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(`${RUNPOD_API_BASE}${endpoint}`, options)
    const data = (await response.json()) as any

    if (!response.ok) {
      throw new Error(
        data.error || `API request failed with status ${response.status}`
      )
    }

    return data
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`RunPod API error: ${error.message}`)
    }
    throw error
  }
}

// Register methods
server.tool(
  'listPods',
  'List all pods',
  ApiKeySchema.shape,
  async ({ apiKey }: z.infer<typeof ApiKeySchema>, extra: any) => {
    try {
      const data = await makeApiRequest(apiKey, '/pod')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data.pods, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

server.tool(
  'createPod',
  'Create a new pod',
  { ...ApiKeySchema.shape, ...CreatePodInputSchema.shape },
  async (
    {
      apiKey,
      ...podConfig
    }: z.infer<typeof ApiKeySchema & typeof CreatePodInputSchema>,
    extra: any
  ) => {
    try {
      const data = await makeApiRequest(apiKey, '/pod', 'POST', podConfig)
      return {
        content: [
          {
            type: 'text',
            text: `Pod created successfully with ID: ${data.id}`,
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error creating pod: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

server.tool(
  'getPod',
  'Get information about a pod',
  { ...ApiKeySchema.shape, ...PodIdInputSchema.shape },
  async (
    { apiKey, podId }: z.infer<typeof ApiKeySchema & typeof PodIdInputSchema>,
    extra: any
  ) => {
    try {
      const data = await makeApiRequest(apiKey, `/pod/${podId}`)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data.pod, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error getting pod: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

server.tool(
  'terminatePod',
  'Terminate a pod',
  { ...ApiKeySchema.shape, ...PodIdInputSchema.shape },
  async (
    { apiKey, podId }: z.infer<typeof ApiKeySchema & typeof PodIdInputSchema>,
    extra: any
  ) => {
    try {
      await makeApiRequest(apiKey, `/pod/${podId}/terminate`, 'POST')
      return {
        content: [
          {
            type: 'text',
            text: `Pod ${podId} terminated successfully`,
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error terminating pod: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

server.tool(
  'startPod',
  'Start a stopped pod',
  { ...ApiKeySchema.shape, ...PodIdInputSchema.shape },
  async (
    { apiKey, podId }: z.infer<typeof ApiKeySchema & typeof PodIdInputSchema>,
    extra: any
  ) => {
    try {
      await makeApiRequest(apiKey, `/pod/${podId}/start`, 'POST')
      return {
        content: [
          {
            type: 'text',
            text: `Pod ${podId} started successfully`,
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error starting pod: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

server.tool(
  'stopPod',
  'Stop a pod',
  { ...ApiKeySchema.shape, ...PodIdInputSchema.shape },
  async (
    { apiKey, podId }: z.infer<typeof ApiKeySchema & typeof PodIdInputSchema>,
    extra: any
  ) => {
    try {
      await makeApiRequest(apiKey, `/pod/${podId}/stop`, 'POST')
      return {
        content: [
          {
            type: 'text',
            text: `Pod ${podId} stopped successfully`,
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error stopping pod: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

server.tool(
  'listServerlessEndpoints',
  'List all serverless endpoints',
  ApiKeySchema.shape,
  async ({ apiKey }: z.infer<typeof ApiKeySchema>, extra: any) => {
    try {
      const data = await makeApiRequest(apiKey, '/serverless-endpoint')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data.endpoints, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  }
)

// Replace the direct connection code
// const transport = new StdioServerTransport()
// server.connect(transport)
// console.error('RunPod MCP server started')

// With a proper main function
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('RunPod MCP server running on stdio')
}

main().catch((error) => {
  console.error('Fatal error in main():', error)
  process.exit(1)
})
