import type { ToolDefinition } from './tools'

export const WORKFLOW_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_workflows',
    description: '分页列出可执行工作流，避免一次性返回全部数据。适合先浏览工作流清单，再决定是否继续搜索或执行。',
    input_schema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: '页码，从 1 开始。默认 1。',
          default: 1,
        },
        page_size: {
          type: 'number',
          description: '每页返回数量，默认 10，建议不超过 50。',
          default: 10,
        },
      },
    },
  },
  {
    name: 'search_workflow',
    description: '按关键词搜索可执行工作流，匹配工作流 title/name 和 description。返回候选工作流及其输入参数定义，供后续确认参数并执行。',
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '搜索关键词，用于匹配工作流标题、名称和描述。',
        },
        page: {
          type: 'number',
          description: '页码，从 1 开始。默认 1。',
          default: 1,
        },
        page_size: {
          type: 'number',
          description: '每页返回数量，默认 10，建议不超过 50。',
          default: 10,
        },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'execute_workflow_sync',
    description: '同步执行指定工作流。必须先确认 workflow_id 和工作流输入参数；执行后等待完成并返回节点结果摘要。',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: '要执行的工作流 ID，来自 search_workflow 返回结果。',
        },
        input: {
          type: 'object',
          description: '工作流输入参数，key 必须对应工作流开始节点 inputFields 的 key。',
          properties: {},
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'execute_workflow_async',
    description: '异步执行指定工作流。必须先确认 workflow_id 和工作流输入参数；立即返回 execution_id，后续用 get_workflow_result 查询结果。',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: '要执行的工作流 ID，来自 search_workflow 返回结果。',
        },
        input: {
          type: 'object',
          description: '工作流输入参数，key 必须对应工作流开始节点 inputFields 的 key。',
          properties: {},
        },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'get_workflow_result',
    description: '查询工作流执行结果。通过 execution_id 获取状态和节点输入/输出，可选 workflow_id 用于更准确地读取持久化执行日志。',
    input_schema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: '执行 ID，由 execute_workflow_sync 或 execute_workflow_async 返回。',
        },
        workflow_id: {
          type: 'string',
          description: '可选，工作流 ID。提供后可从对应工作流执行日志中查询。',
        },
        node_id: {
          type: 'string',
          description: '可选，只返回指定节点的执行结果。',
        },
      },
      required: ['execution_id'],
    },
  },
  {
    name: 'get_workflow_latest_result',
    description: '查询指定工作流最近一次执行结果。只需要 workflow_id，会自动读取该工作流最新的持久化执行日志。',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: '要查询最近一次执行结果的工作流 ID，来自 search_workflow 或 list_workflows 返回结果。',
        },
        node_id: {
          type: 'string',
          description: '可选，只返回指定节点的执行结果。',
        },
      },
      required: ['workflow_id'],
    },
  },
]

export const WORKFLOW_AGENT_SYSTEM_PROMPT = [
  '你是 WorkFox 的全局工作流执行助手。',
  '你的核心职责是理解用户需求，搜索匹配的工作流，核对工作流输入节点参数，向用户追问缺失的必要参数，然后执行工作流并说明执行结果。',
  '工作流程:',
  '1. 用户没有明确 workflow_id 时，可以先调用 list_workflows 分页浏览，也可以直接调用 search_workflow 用关键词搜索候选工作流。',
  '2. 根据候选工作流的 title/name、description 和 inputFields 判断是否匹配用户需求。候选不明确时，先让用户选择，不要猜测执行。',
  '3. 执行前检查开始节点 inputFields。缺少必填或无法从用户上下文可靠推断的参数时，先用自然语言询问用户。',
  '4. 参数齐全后，短任务优先调用 execute_workflow_sync；长任务或用户要求后台执行时调用 execute_workflow_async，并告知 execution_id。',
  '5. 异步任务需要结果时调用 get_workflow_result 查询；用户只提供 workflow_id 并要求最近一次结果时调用 get_workflow_latest_result。',
  '6. 返回结果时用用户能理解的业务语言总结成功、失败、关键输出和下一步。',
  '约束:',
  '- 只能使用 list_workflows、search_workflow、execute_workflow_sync、execute_workflow_async、get_workflow_result、get_workflow_latest_result 这几类工作流执行工具。',
  '- 不要修改工作流结构。',
  '- 不要编造工作流、参数或执行结果；工具结果不足时明确说明需要补充信息。',
].join('\n')
