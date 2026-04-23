module.exports = {
  nodes: [
    {
      type: 'openai_create_image',
      label: 'OpenAI 文生图',
      category: 'OpenAI',
      icon: 'Image',
      description: '通过文字描述使用 OpenAI 生成图片',
      properties: [
        { key: 'apiKey', label: 'API Key', type: 'text', required: true, tooltip: 'OpenAI API Key', default: '{{ __config__["workfox.openai"]["apiKey"] }}' },
        { key: 'prompt', label: '图片描述', type: 'textarea', required: true, tooltip: '描述你想生成的图片内容' },
        { key: 'model', label: '模型', type: 'select', default: 'gpt-image-1', options: [
          { label: 'gpt-image-1 (默认)', value: 'gpt-image-1' },
          { label: 'gpt-image-1.5', value: 'gpt-image-1.5' },
          { label: 'gpt-image-1-mini', value: 'gpt-image-1-mini' },
          { label: 'dall-e-3', value: 'dall-e-3' },
          { label: 'dall-e-2', value: 'dall-e-2' },
        ] },
        { key: 'size', label: '尺寸', type: 'select', default: 'auto', options: [
          { label: '自动', value: 'auto' },
          { label: '1024x1024', value: '1024x1024' },
          { label: '1536x1024 (横版)', value: '1536x1024' },
          { label: '1024x1536 (竖版)', value: '1024x1536' },
          { label: '256x256 (dall-e-2)', value: '256x256' },
          { label: '512x512 (dall-e-2)', value: '512x512' },
          { label: '1792x1024 (dall-e-3)', value: '1792x1024' },
          { label: '1024x1792 (dall-e-3)', value: '1024x1792' },
        ] },
        { key: 'quality', label: '质量', type: 'select', default: 'auto', options: [
          { label: '自动', value: 'auto' },
          { label: '高', value: 'high' },
          { label: '中', value: 'medium' },
          { label: '低', value: 'low' },
          { label: 'HD (dall-e-3)', value: 'hd' },
          { label: 'Standard (dall-e-3)', value: 'standard' },
        ] },
        { key: 'n', label: '数量', type: 'number', default: 1, tooltip: '1-10，dall-e-3 仅支持 1' },
        { key: 'output_format', label: '输出格式', type: 'select', default: 'png', options: [
          { label: 'PNG (默认)', value: 'png' },
          { label: 'JPEG', value: 'jpeg' },
          { label: 'WebP', value: 'webp' },
        ] },
        { key: 'background', label: '背景', type: 'select', default: 'auto', options: [
          { label: '自动', value: 'auto' },
          { label: '透明', value: 'transparent' },
          { label: '不透明', value: 'opaque' },
        ] },
        { key: 'baseUrl', label: 'API 地址', type: 'text', default: '{{ __config__["workfox.openai"]["baseUrl"] }}', tooltip: 'OpenAI API 基础地址' },
      ],
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
        { key: 'data', type: 'object', children: [
          { key: 'images', type: 'object', children: [] },
          { key: 'created', type: 'number' },
          { key: 'usage', type: 'object', children: [] },
        ] },
      ],
      handler: async (ctx, args) => {
        const baseUrl = args.baseUrl || 'https://api.openai.com'
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${args.apiKey}`,
        }
        const body = {
          model: args.model || 'gpt-image-1',
          prompt: args.prompt,
          ...(args.size && args.size !== 'auto' && { size: args.size }),
          ...(args.quality && args.quality !== 'auto' && { quality: args.quality }),
          ...(args.n && args.n > 1 && { n: args.n }),
          ...(args.output_format && { output_format: args.output_format }),
          ...(args.background && args.background !== 'auto' && { background: args.background }),
        }
        ctx.logger.info(`请求地址: ${baseUrl}/v1/images/generations`)
        ctx.logger.info(`模型: ${body.model}, 尺寸: ${body.size || 'auto'}, 质量: ${body.quality || 'auto'}`)
        ctx.logger.info(`提示词: ${body.prompt}`)
        const result = await ctx.api.postJson(`${baseUrl}/v1/images/generations`, { headers, body, timeout: 600000 })
        const items = result.data || []
        const images = items.map(d => d.b64_json || d.url).filter(Boolean)
        ctx.logger.info(`生成完成，共 ${images.length} 张图片`)
        return { success: true, message: `生成 ${images.length} 张图片`, data: { images, created: result.created, usage: result.usage } }
      },
    },
    {
      type: 'openai_edit_image',
      label: 'OpenAI 图片编辑',
      category: 'OpenAI',
      icon: 'Wand2',
      description: '基于输入图片和描述进行 AI 图片编辑',
      properties: [
        { key: 'apiKey', label: 'API Key', type: 'text', required: true, tooltip: 'OpenAI API Key', default: '{{ __config__["workfox.openai"]["apiKey"] }}' },
        { key: 'prompt', label: '编辑描述', type: 'textarea', required: true, tooltip: '描述你想要的编辑效果' },
        { key: 'images', label: '图片 URL', type: 'textarea', required: true, tooltip: '输入图片 URL 数组，如 [{"image_url":"https://..."}]' },
        { key: 'model', label: '模型', type: 'select', default: 'gpt-image-1', options: [
          { label: 'gpt-image-1 (默认)', value: 'gpt-image-1' },
          { label: 'gpt-image-1.5', value: 'gpt-image-1.5' },
          { label: 'gpt-image-1-mini', value: 'gpt-image-1-mini' },
          { label: 'chatgpt-image-latest', value: 'chatgpt-image-latest' },
        ] },
        { key: 'size', label: '尺寸', type: 'select', default: 'auto', options: [
          { label: '自动', value: 'auto' },
          { label: '1024x1024', value: '1024x1024' },
          { label: '1536x1024', value: '1536x1024' },
          { label: '1024x1536', value: '1024x1536' },
        ] },
        { key: 'quality', label: '质量', type: 'select', default: 'auto', options: [
          { label: '自动', value: 'auto' },
          { label: '高', value: 'high' },
          { label: '中', value: 'medium' },
          { label: '低', value: 'low' },
        ] },
        { key: 'n', label: '数量', type: 'number', default: 1 },
        { key: 'background', label: '背景', type: 'select', default: 'auto', options: [
          { label: '自动', value: 'auto' },
          { label: '透明', value: 'transparent' },
          { label: '不透明', value: 'opaque' },
        ] },
        { key: 'baseUrl', label: 'API 地址', type: 'text', default: '{{ __config__["workfox.openai"]["baseUrl"] }}', tooltip: 'OpenAI API 基础地址' },
      ],
      outputs: [
        { key: 'success', type: 'boolean' },
        { key: 'message', type: 'string' },
        { key: 'data', type: 'object', children: [
          { key: 'images', type: 'object', children: [] },
          { key: 'created', type: 'number' },
          { key: 'usage', type: 'object', children: [] },
        ] },
      ],
      handler: async (ctx, args) => {
        const baseUrl = args.baseUrl || 'https://api.openai.com'
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${args.apiKey}`,
        }
        const images = Array.isArray(args.images) ? args.images : JSON.parse(args.images)
        const body = {
          model: args.model || 'gpt-image-1',
          prompt: args.prompt,
          images,
          ...(args.size && args.size !== 'auto' && { size: args.size }),
          ...(args.quality && args.quality !== 'auto' && { quality: args.quality }),
          ...(args.n && args.n > 1 && { n: args.n }),
          ...(args.background && args.background !== 'auto' && { background: args.background }),
        }
        ctx.logger.info(`请求地址: ${baseUrl}/v1/images/edits`)
        ctx.logger.info(`模型: ${body.model}, 输入图片: ${images.length} 张`)
        ctx.logger.info(`提示词: ${body.prompt}`)
        const result = await ctx.api.postJson(`${baseUrl}/v1/images/edits`, { headers, body, timeout: 600000 })
        const items = result.data || []
        const outputImages = items.map(d => d.b64_json || d.url).filter(Boolean)
        ctx.logger.info(`编辑完成，共 ${outputImages.length} 张图片`)
        return { success: true, message: `图片编辑完成，生成 ${outputImages.length} 张图片`, data: { images: outputImages, created: result.created, usage: result.usage } }
      },
    },
  ],
}
