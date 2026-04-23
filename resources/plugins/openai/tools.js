const DEFAULT_BASE_URL = 'https://api.openai.com'

function getBaseUrl(args) {
  return args.baseUrl || DEFAULT_BASE_URL
}

function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('缺少 apiKey')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

module.exports = {
  tools: [
    {
      name: 'openai_create_image',
      description: 'OpenAI 文生图：通过文字描述生成图片。支持 gpt-image-1/gpt-image-1-mini/gpt-image-1.5/dall-e-3/dall-e-2 模型。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'OpenAI API Key' },
          prompt: { type: 'string', description: '图片描述文字' },
          model: { type: 'string', description: '模型，默认 gpt-image-1' },
          size: { type: 'string', description: '图片尺寸，默认 auto，支持 1024x1024/1536x1024/1024x1536/auto' },
          quality: { type: 'string', description: '质量，默认 auto，支持 low/medium/high/auto/hd/standard' },
          n: { type: 'number', description: '生成数量，1-10，默认 1' },
          output_format: { type: 'string', description: '输出格式，支持 png/jpeg/webp' },
          background: { type: 'string', description: '背景，支持 transparent/opaque/auto' },
          baseUrl: { type: 'string', description: 'API 基础地址，默认 https://api.openai.com' },
        },
        required: ['apiKey', 'prompt'],
      },
    },
    {
      name: 'openai_edit_image',
      description: 'OpenAI 图片编辑：基于输入图片和文字描述生成编辑后的图片，支持多图输入、风格迁移等。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'OpenAI API Key' },
          prompt: { type: 'string', description: '编辑描述' },
          images: { type: 'array', items: { type: 'object', properties: { image_url: { type: 'string' } } }, description: '输入图片数组，每项包含 image_url' },
          model: { type: 'string', description: '模型，默认 gpt-image-1' },
          size: { type: 'string', description: '图片尺寸' },
          quality: { type: 'string', description: '质量' },
          n: { type: 'number', description: '生成数量' },
          background: { type: 'string', description: '背景，支持 transparent/opaque/auto' },
          baseUrl: { type: 'string', description: 'API 基础地址' },
        },
        required: ['apiKey', 'prompt', 'images'],
      },
    },
  ],

  handler: async (name, args, api) => {
    const baseUrl = getBaseUrl(args)
    const headers = getHeaders(args)

    switch (name) {
      case 'openai_create_image': {
        const body = {
          model: args.model || 'gpt-image-1',
          prompt: args.prompt,
          ...(args.size && { size: args.size }),
          ...(args.quality && { quality: args.quality }),
          ...(args.n && { n: args.n }),
          ...(args.output_format && { output_format: args.output_format }),
          ...(args.background && { background: args.background }),
        }
        const result = await api.postJson(`${baseUrl}/v1/images/generations`, { headers, body, timeout: 600000 })
        const items = result.data || []
        const images = items.map(d => d.b64_json || d.url).filter(Boolean)
        return {
          success: true,
          message: `生成 ${images.length} 张图片`,
          data: { images, created: result.created, usage: result.usage },
        }
      }
      case 'openai_edit_image': {
        const body = {
          model: args.model || 'gpt-image-1',
          prompt: args.prompt,
          images: args.images,
          ...(args.size && { size: args.size }),
          ...(args.quality && { quality: args.quality }),
          ...(args.n && { n: args.n }),
          ...(args.background && { background: args.background }),
        }
        const result = await api.postJson(`${baseUrl}/v1/images/edits`, { headers, body, timeout: 600000 })
        const items = result.data || []
        const images = items.map(d => d.b64_json || d.url).filter(Boolean)
        return {
          success: true,
          message: `图片编辑完成，生成 ${images.length} 张图片`,
          data: { images, created: result.created, usage: result.usage },
        }
      }
      default:
        return { success: false, message: `未知工具: ${name}` }
    }
  },
}
