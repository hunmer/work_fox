const SYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('缺少 apiKey（阿里云百炼 DashScope API Key）')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

function extractImageUrls(result) {
  const choices = result.output?.choices || []
  const urls = []
  for (const choice of choices) {
    const contents = choice.message?.content || []
    for (const item of contents) {
      if (item.image) urls.push(item.image)
    }
  }
  return urls
}

module.exports = {
  tools: [
    {
      name: 'aliyun_text_to_image',
      description: '阿里云百炼AI文生图：通过文字描述生成图片。支持千问(qwen-image-2.0-pro/qwen-image-2.0/qwen-image-max)和万相(wan2.6-t2i/wan2.7-image-pro)系列模型。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
          prompt: { type: 'string', description: '图片描述文字（正向提示词）' },
          model: { type: 'string', description: '模型名，默认 qwen-image-2.0-pro。可选：qwen-image-2.0-pro/qwen-image-2.0/qwen-image-max/wan2.6-t2i/wan2.7-image-pro' },
          size: { type: 'string', description: '分辨率，默认 2048*2048。千问2.0系列支持512*512~2048*2048；万相2.6支持1280*1280~1440*1440；万相2.7支持1K/2K/4K或自定义宽*高' },
          negativePrompt: { type: 'string', description: '反向提示词' },
          n: { type: 'number', description: '生成图片数量，默认1。千问2.0系列支持1-6张；万相2.6支持1-4张；万相2.7支持1-4张（组图模式1-12）' },
          promptExtend: { type: 'boolean', description: '是否开启提示词智能改写，默认true（仅千问系列）' },
          seed: { type: 'number', description: '随机种子，0~2147483647' },
        },
        required: ['apiKey', 'prompt'],
      },
    },
    {
      name: 'aliyun_image_edit',
      description: '阿里云百炼AI图像编辑：基于输入图片和文字描述进行图像编辑、风格迁移、物体增删等。支持千问(qwen-image-2.0-pro/qwen-image-edit)和万相(wan2.7-image-pro)系列模型。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
          prompt: { type: 'string', description: '编辑指令描述' },
          images: { type: 'array', items: { type: 'string' }, description: '输入图片URL数组（1-9张）' },
          model: { type: 'string', description: '模型名，默认 qwen-image-2.0-pro。可选：qwen-image-2.0-pro/qwen-image-2.0/qwen-image-edit/wan2.7-image-pro' },
          size: { type: 'string', description: '输出分辨率，默认 2048*2048' },
          negativePrompt: { type: 'string', description: '反向提示词' },
          n: { type: 'number', description: '生成图片数量，默认1' },
          promptExtend: { type: 'boolean', description: '是否开启提示词智能改写，默认true' },
        },
        required: ['apiKey', 'prompt'],
      },
    },
  ],

  handler: async (name, args, api) => {
    const headers = getHeaders(args)

    switch (name) {
      case 'aliyun_text_to_image': {
        const model = args.model || 'qwen-image-2.0-pro'
        const body = {
          model,
          input: {
            messages: [
              {
                role: 'user',
                content: [{ text: args.prompt }],
              },
            ],
          },
          parameters: {
            size: args.size || '2048*2048',
            ...(args.n && { n: args.n }),
            ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
            ...(args.seed != null && { seed: args.seed }),
            ...(args.promptExtend != null ? { prompt_extend: args.promptExtend } : { prompt_extend: true }),
          },
        }
        const result = await api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
        if (result.code || result.message) {
          return { success: false, message: `API错误: ${result.code} - ${result.message}` }
        }
        const urls = extractImageUrls(result)
        return {
          success: true,
          message: `生成 ${urls.length} 张图片`,
          data: { images: urls, requestId: result.request_id },
        }
      }
      case 'aliyun_image_edit': {
        if (!args.images?.length) {
          return { success: false, message: '图像编辑需要至少提供1张输入图片(images)' }
        }
        const model = args.model || 'qwen-image-2.0-pro'
        const content = []
        for (const img of args.images) {
          content.push({ image: img })
        }
        content.push({ text: args.prompt })
        const body = {
          model,
          input: {
            messages: [
              { role: 'user', content },
            ],
          },
          parameters: {
            size: args.size || '2048*2048',
            ...(args.n && { n: args.n }),
            ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
            ...(args.promptExtend != null ? { prompt_extend: args.promptExtend } : { prompt_extend: true }),
          },
        }
        const result = await api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
        if (result.code || result.message) {
          return { success: false, message: `API错误: ${result.code} - ${result.message}` }
        }
        const urls = extractImageUrls(result)
        return {
          success: true,
          message: `图像编辑完成，生成 ${urls.length} 张图片`,
          data: { images: urls, requestId: result.request_id },
        }
      }
      default:
        return { success: false, message: `未知工具: ${name}` }
    }
  },
}
