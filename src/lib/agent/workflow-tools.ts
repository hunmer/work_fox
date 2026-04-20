/**
 * 工作流 AI 助手的工具定义。
 *
 * 该文件只负责工作流编辑工具 schema，系统提示词单独放在 workflow-prompt.ts，
 * 避免工具契约和 prompt 语义耦合在一起。
 */

import type { ToolDefinition } from './tools'

const WORKFLOW_SEARCH_PROPERTIES = {
  keyword: {
    type: 'string',
    description: '模糊搜索关键词，会同时匹配 type、label、category、description。',
  },
  type: {
    type: 'string',
    description: '按节点类型模糊筛选，例如 "run_code"、"gallery_preview"。',
  },
  label: {
    type: 'string',
    description: '按节点标签模糊筛选。',
  },
  category: {
    type: 'string',
    description: '按分类模糊筛选，例如 "流程控制"、"AI"、"展示"。',
  },
  description: {
    type: 'string',
    description: '按节点描述模糊筛选。',
  },
} as const

/** 工作流 AI 助手的工具定义 */
export const WORKFLOW_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_workflow',
    description:
      '按 workflow_id 从磁盘读取指定工作流的最新已保存文件数据。默认返回摘要，summarize=false 返回完整数据。注意：它不包含当前画布未保存改动。',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: '要读取的工作流 ID，必须显式传入。',
        },
        summarize: {
          type: 'boolean',
          description: '是否返回摘要。默认 true；false 返回完整 nodes/edges/data/position。',
          default: true,
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'get_current_workflow',
    description:
      '读取当前渲染进程画布中的工作流节点和连线，包含尚未保存到文件的最新编辑状态。默认返回摘要，summarize=false 返回完整数据。',
    input_schema: {
      type: 'object',
      properties: {
        summarize: {
          type: 'boolean',
          description: '是否返回摘要。默认 true；false 返回完整 nodes/edges/data/position。',
          default: true,
        },
      },
    },
  },
  {
    name: 'search_nodes',
    description:
      '在当前工作流中搜索节点，支持按 keyword/type/label/category/description 模糊匹配。返回当前画布中匹配的节点，并附带节点类型的分类和描述信息。',
    input_schema: {
      type: 'object',
      properties: WORKFLOW_SEARCH_PROPERTIES,
    },
  },
  {
    name: 'list_node_types',
    description:
      '查询工作流中可用的节点类型列表。可按分类筛选，返回每种节点类型的 type、标签、分类、描述、句柄和参数定义。找到候选类型后，如需实际使用，继续调用 search_node_usage 查看具体用法。',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            '按分类筛选节点类型。常见分类包括：流程控制、浏览器操作、数据处理、AI 能力、条件判断等。不传则返回全部。',
        },
      },
    },
  },
  {
    name: 'search_node_usage',
    description:
      '查询节点类型的具体使用方法。支持按 keyword/type/label/category/description 模糊匹配，返回节点定义、字段说明、变量支持、编排建议和示例数据。准备使用陌生节点前必须先调用它。',
    input_schema: {
      type: 'object',
      properties: WORKFLOW_SEARCH_PROPERTIES,
    },
  },
  {
    name: 'create_node',
    description:
      '在工作流中创建一个新节点。需要指定节点类型（type），可通过 list_node_types 找候选，通过 search_node_usage 查看具体字段后再创建。可选提供节点标签（label）和参数数据（data）。创建后节点会出现在画布上，需要用 create_edge 连接到其他节点。',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            '节点类型标识，必须是 list_node_types 返回的有效类型。例如 "start"、"end"、"browser-click"、"condition" 等。',
        },
        label: {
          type: 'string',
          description: '节点显示名称，方便用户识别。如果不提供则使用节点类型的默认标签。',
        },
        data: {
          type: 'object',
          description:
            '节点的参数数据，键值对结构，对应节点类型的 properties 定义。例如 { "selector": "#btn", "url": "https://example.com" }。',
          properties: {},
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_node',
    description:
      '更新指定节点的参数数据。只需传入要修改的字段，未传入的字段保持不变。更新前建议先用 get_current_workflow(summarize=false) 查看节点当前完整 data；若不确定字段含义，先用 search_node_usage 查看该节点类型的具体用法。',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要更新的节点 ID。',
        },
        label: {
          type: 'string',
          description: '可选，同时更新节点显示名称。',
        },
        data: {
          type: 'object',
          description:
            '要更新的参数键值对，会与现有数据合并（浅合并）。例如 { "selector": "#new-btn", "text": "提交" }。',
          properties: {},
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'delete_node',
    description:
      '删除指定节点及其所有相关的连线。这是一个破坏性操作，删除后无法撤销，请确认节点 ID 正确后再执行。',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要删除的节点 ID。删除该节点时会自动移除与之相连的所有边。',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_edge',
    description:
      '创建一条连线，将两个节点连接起来。source 是起始节点（上游），target 是目标节点（下游）。可选指定 sourceHandle/targetHandle 以连接到特定的连接点。',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: '起始节点（上游节点）的 ID。',
        },
        target: {
          type: 'string',
          description: '目标节点（下游节点）的 ID。',
        },
        sourceHandle: {
          type: 'string',
          description: '起始节点的连接点标识，用于条件分支等有多个输出的节点。例如 "true"、"false"、"default"。',
        },
        targetHandle: {
          type: 'string',
          description: '目标节点的连接点标识，用于有多个输入的节点。',
        },
      },
      required: ['source', 'target'],
    },
  },
  {
    name: 'delete_edge',
    description:
      '删除指定连线。删除后两个节点之间的连接断开，但不影响节点本身。',
    input_schema: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: '要删除的连线 ID。',
        },
      },
      required: ['edgeId'],
    },
  },
  {
    name: 'insert_node',
    description:
      '在一条已有连线的中途插入新节点。操作为原子性：删除原边，创建新节点，再创建两条新边连接 source → 新节点 → target。适合在两个已有节点之间插入中间处理步骤。插入前应先用 search_node_usage 查看目标节点类型的字段和使用方式。',
    input_schema: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: '要在其中插入节点的连线 ID。该边会被删除并替换为 source → 新节点 → target 两条新边。',
        },
        type: {
          type: 'string',
          description: '新节点的类型标识，必须是 list_node_types 返回的有效类型。',
        },
        label: {
          type: 'string',
          description: '新节点的显示名称，不提供则使用节点类型的默认标签。',
        },
        data: {
          type: 'object',
          description: '新节点的参数数据，键值对结构。',
          properties: {},
        },
      },
      required: ['edgeId', 'type'],
    },
  },
  {
    name: 'batch_update',
    description:
      '批量执行多个工作流编辑操作，在一个事务中完成。优先使用 operations 数组；也兼容 createNodes/deleteNodeIds/createEdges/deleteEdgeIds 这种旧格式。所有操作要么全部成功，要么全部回滚，适合需要原子性执行的复杂编辑场景。',
    input_schema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: '推荐格式。每项为 { tool, args }，tool 支持 create_node/update_node/delete_node/create_edge/delete_edge。',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: '要执行的工作流工具名。' },
              args: { type: 'object', description: '对应工具的参数。', properties: {} },
            },
            required: ['tool'],
          },
        },
        createNodes: {
          type: 'array',
          description: '旧格式兼容。要创建的节点列表。',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: '节点类型' },
              label: { type: 'string', description: '节点标签' },
              data: { type: 'object', description: '节点参数', properties: {} },
            },
            required: ['type'],
          },
        },
        deleteNodeIds: {
          type: 'array',
          description: '旧格式兼容。要删除的节点 ID 列表。删除节点时会自动移除相关连线。',
          items: { type: 'string' },
        },
        createEdges: {
          type: 'array',
          description: '旧格式兼容。要创建的连线列表。',
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: '起始节点 ID' },
              targetId: { type: 'string', description: '目标节点 ID' },
              sourceHandle: { type: 'string', description: '起始连接点' },
              targetHandle: { type: 'string', description: '目标连接点' },
            },
            required: ['sourceId', 'targetId'],
          },
        },
        deleteEdgeIds: {
          type: 'array',
          description: '旧格式兼容。要删除的连线 ID 列表。',
          items: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'auto_layout',
    description:
      '使用 dagre 算法对工作流进行自动布局。会自动计算所有节点的位置，使图结构清晰、美观、无重叠。适合在添加/删除节点后整理画布，或在初始创建工作流后一键排列。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_workflow_sync',
    description:
      '同步执行当前工作流。会阻塞等待所有节点按拓扑顺序执行完成后返回完整执行结果（每个节点的输入、输出、状态和耗时）。适用于需要立即获取结果的场景。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_workflow_async',
    description:
      '异步执行当前工作流。立即返回一个 execution_id 用于后续查询执行状态和结果，工作流在后台运行。适用于长时间运行的工作流，可配合 get_workflow_result 轮询结果。',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_workflow_result',
    description:
      '获取工作流执行结果。通过 execution_id 查询执行状态和各节点的输入/输出。可选传入 node_id 获取指定节点的结果，不传则返回全部节点的执行结果。',
    input_schema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: '执行 ID，由 execute_workflow_async 返回。同步执行也可用其返回的 execution_id 查询。',
        },
        node_id: {
          type: 'string',
          description: '可选，指定节点 ID，仅返回该节点的执行结果。不传则返回所有节点的结果。',
        },
      },
      required: ['execution_id'],
    },
  },
]
