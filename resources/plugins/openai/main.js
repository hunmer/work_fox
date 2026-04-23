exports.activate = (context) => {
  context.logger.info('OpenAI 图片生成插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('OpenAI 图片生成插件已停用')
}
