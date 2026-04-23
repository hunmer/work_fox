const SYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

const QWEN_IMAGE_MODELS = [
  { label: 'qwen-image-2.0-pro (推荐)', value: 'qwen-image-2.0-pro' },
  { label: 'qwen-image-2.0', value: 'qwen-image-2.0' },
  { label: 'qwen-image-max', value: 'qwen-image-max' },
  { label: 'wan2.7-image-pro (万相2.7)', value: 'wan2.7-image-pro' },
  { label: 'wan2.7-image (万相2.7加速)', value: 'wan2.7-image' },
  { label: 'wan2.6-t2i (万相2.6)', value: 'wan2.6-t2i' },
]

const QWEN_EDIT_MODELS = [
  { label: 'qwen-image-2.0-pro (推荐)', value: 'qwen-image-2.0-pro' },
  { label: 'qwen-image-2.0', value: 'qwen-image-2.0' },
  { label: 'qwen-image-edit', value: 'qwen-image-edit' },
  { label: 'wan2.7-image-pro (万相2.7)', value: 'wan2.7-image-pro' },
  { label: 'wan2.7-image (万相2.7加速)', value: 'wan2.7-image' },
]

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
  nodes: [
    {
      type: 'aliyun_text_to_image',
      label: 'AI文生图',
      category: '阿里云AI',
      icon: 'Image',
      description: '通过文字描述使用阿里云百炼AI生成图片（千问/万相模型）',
      properties: [
        { key: 'apiKey', label: 'API Key', type: 'text', required: true, tooltip: '阿里云百炼 DashScope API Key', default: '{{ __config__["workfox.aliyun-ai"]["apiKey"] }}' },
        { key: 'prompt', label: '图片描述', type: 'textarea', required: true, tooltip: '描述你想生成的图片内容' },
        { key: 'model', label: '模型', type: 'select', default: 'qwen-image-2.0-pro', options: QWEN_IMAGE_MODELS, tooltip: '选择生成模型' },
        { key: 'size', label: '分辨率', type: 'select', default: '2048*2048', options: [
          { label: '2048*2048 (默认)', value: '2048*2048' },
          { label: '1024*1024', value: '1024*1024' },
          { label: '1536*1536', value: '1536*1536' },
          { label: '2688*1536 (16:9)', value: '2688*1536' },
          { label: '1536*2688 (9:16)', value: '1536*2688' },
          { label: '2368*1728 (4:3)', value: '2368*1728' },
          { label: '1728*2368 (3:4)', value: '1728*2368' },
          { label: '1280*1280 (万相)', value: '1280*1280' },
          { label: '1K (万相2.7)', value: '1K' },
          { label: '2K (万相2.7)', value: '2K' },
          { label: '4K (万相2.7)', value: '4K' },
        ] },
        { key: 'n', label: '图片数量', type: 'number', default: 1, tooltip: '生成图片数量，部分模型支持1-6张' },
        { key: 'negativePrompt', label: '反向提示词', type: 'textarea', tooltip: '排除不想出现的内容' },
        { key: 'promptExtend', label: '智能改写', type: 'select', default: 'true', options: [
          { label: '开启 (默认)', value: 'true' },
          { label: '关闭', value: 'false' },
        ], tooltip: '开启后模型自动优化提示词' },
        { key: 'seed', label: '随机种子', type: 'number', tooltip: '固定种子可复现结果，0~2147483647' },
      ],
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
        { key: 'data', type: 'object', children: [
          { key: 'images', type: 'object', children: [] },
          { key: 'requestId', type: 'string' },
        ] },
      ],
      handler: async (ctx, args) => {
        const apiKey = args.apiKey
        if (!apiKey) throw new Error('缺少 API Key')

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        }
        const body = {
          model: args.model || 'qwen-image-2.0-pro',
          input: {
            messages: [
              { role: 'user', content: [{ text: args.prompt }] },
            ],
          },
          parameters: {
            size: args.size || '2048*2048',
            ...(args.n && { n: args.n }),
            ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
            ...(args.seed != null && { seed: args.seed }),
            prompt_extend: args.promptExtend !== 'false',
          },
        }
        ctx.logger.info(`请求地址: ${SYNC_ENDPOINT}`)
        ctx.logger.info(`模型: ${body.model}, 分辨率: ${body.parameters.size}`)
        ctx.logger.info(`提示词: ${args.prompt}`)

        const result = await ctx.api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
        if (result.code || result.message) {
          ctx.logger.error(`API错误: ${result.code} - ${result.message}`)
          return { success: false, message: `API错误: ${result.code} - ${result.message}` }
        }
        const urls = extractImageUrls(result)
        ctx.logger.info(`生成完成，共 ${urls.length} 张图片`)
        return { success: true, message: `生成 ${urls.length} 张图片`, data: { images: urls, requestId: result.request_id } }
      },
    },
    {
      type: 'aliyun_image_edit',
      label: 'AI图像编辑',
      category: '阿里云AI',
      icon: 'Wand2',
      description: '基于输入图片和文字描述进行图像编辑（风格迁移、物体增删、局部修改等）',
      properties: [
        { key: 'apiKey', label: 'API Key', type: 'text', required: true, tooltip: '阿里云百炼 DashScope API Key', default: '{{ __config__["workfox.aliyun-ai"]["apiKey"] }}' },
        { key: 'prompt', label: '编辑指令', type: 'textarea', required: true, tooltip: '描述编辑方向，如"将背景改为海边"' },
        { key: 'images', label: '图片URL', type: 'textarea', required: true, tooltip: '输入图片URL数组，如 ["https://..."]，支持1-9张' },
        { key: 'model', label: '模型', type: 'select', default: 'qwen-image-2.0-pro', options: QWEN_EDIT_MODELS, tooltip: '选择编辑模型' },
        { key: 'size', label: '分辨率', type: 'select', default: '2048*2048', options: [
          { label: '2048*2048 (默认)', value: '2048*2048' },
          { label: '1024*1024', value: '1024*1024' },
          { label: '1536*1536', value: '1536*1536' },
          { label: '1K (万相2.7)', value: '1K' },
          { label: '2K (万相2.7)', value: '2K' },
        ] },
        { key: 'n', label: '图片数量', type: 'number', default: 1, tooltip: '生成图片数量' },
        { key: 'negativePrompt', label: '反向提示词', type: 'textarea', tooltip: '排除不想出现的内容' },
        { key: 'promptExtend', label: '智能改写', type: 'select', default: 'true', options: [
          { label: '开启 (默认)', value: 'true' },
          { label: '关闭', value: 'false' },
        ] },
      ],
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
        { key: 'data', type: 'object', children: [
          { key: 'images', type: 'object', children: [] },
          { key: 'requestId', type: 'string' },
        ] },
      ],
      handler: async (ctx, args) => {
        const apiKey = args.apiKey
        if (!apiKey) throw new Error('缺少 API Key')

        const images = Array.isArray(args.images) ? args.images : JSON.parse(args.images)
        if (!images.length) throw new Error('图像编辑需要至少1张输入图片')

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        }
        const content = []
        for (const img of images) {
          content.push({ image: img })
        }
        content.push({ text: args.prompt })
        const body = {
          model: args.model || 'qwen-image-2.0-pro',
          input: {
            messages: [
              { role: 'user', content },
            ],
          },
          parameters: {
            size: args.size || '2048*2048',
            ...(args.n && { n: args.n }),
            ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
            prompt_extend: args.promptExtend !== 'false',
          },
        }
        ctx.logger.info(`请求地址: ${SYNC_ENDPOINT}`)
        ctx.logger.info(`模型: ${body.model}, 分辨率: ${body.parameters.size}`)
        ctx.logger.info(`输入图片: ${images.length} 张`)
        ctx.logger.info(`编辑指令: ${args.prompt}`)

        const result = await ctx.api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
        if (result.code || result.message) {
          ctx.logger.error(`API错误: ${result.code} - ${result.message}`)
          return { success: false, message: `API错误: ${result.code} - ${result.message}` }
        }
        const urls = extractImageUrls(result)
        ctx.logger.info(`图像编辑完成，共 ${urls.length} 张图片`)
        return { success: true, message: `图像编辑完成，生成 ${urls.length} 张图片`, data: { images: urls, requestId: result.request_id } }
      },
    },
  ],
}
