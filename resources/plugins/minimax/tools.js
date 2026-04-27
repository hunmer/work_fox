const MINIMAX_BASE_URL = 'https://api.minimaxi.com'

function getBaseUrl(args) {
  return args.baseUrl || MINIMAX_BASE_URL
}

function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('缺少 MiniMax API Key')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

module.exports = {
  tools: [
    {
      name: 'minimax_tts',
      description: 'MiniMax 语音合成(TTS)：将文字转为语音。支持多种模型(speech-2.8-hd等)、音色、情绪(happy/sad/calm等)、语速(0.5-2.0)。输出音频URL（有效期24小时）或hex编码。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          text: { type: 'string', description: '待合成语音的文本（<10000字符）' },
          model: { type: 'string', description: 'TTS模型，默认 speech-2.8-hd，可选 speech-2.8-turbo/speech-2.6-hd/speech-2.6-turbo/speech-02-hd/speech-02-turbo' },
          voiceId: { type: 'string', description: '音色ID，默认 Chinese (Mandarin)_Lyrical_Voice' },
          speed: { type: 'number', description: '语速 0.5-2.0，默认 1.0' },
          vol: { type: 'number', description: '音量 0-10，默认 1.0' },
          pitch: { type: 'number', description: '语调 -12到12，默认 0' },
          emotion: { type: 'string', description: '情绪: happy/sad/angry/fearful/disgusted/surprised/calm/fluent/whisper' },
          audioFormat: { type: 'string', description: '音频格式: mp3(默认)/wav/flac/pcm' },
          outputFormat: { type: 'string', description: '输出格式: url(默认)/hex' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'text'],
      },
    },
    {
      name: 'minimax_music_generation',
      description: 'MiniMax 音乐生成：通过描述和歌词生成歌曲。支持文生音乐(music-2.6)和翻唱(music-cover)，支持纯音乐模式。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          prompt: { type: 'string', description: '音乐风格描述，如"流行音乐, 难过, 适合在下雨的晚上"' },
          lyrics: { type: 'string', description: '歌词，用 \\n 分隔，支持 [Verse] [Chorus] 等结构标签' },
          model: { type: 'string', description: '模型: music-2.6(默认)/music-cover/music-2.6-free/music-cover-free' },
          isInstrumental: { type: 'boolean', description: '是否纯音乐（无人声），默认 false' },
          lyricsOptimizer: { type: 'boolean', description: '是否根据描述自动生成歌词，默认 false' },
          audioUrl: { type: 'string', description: '翻唱模式专用：参考音频URL' },
          outputFormat: { type: 'string', description: '输出格式: url(默认)/hex' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'prompt'],
      },
    },
    {
      name: 'minimax_lyrics_generation',
      description: 'MiniMax 歌词生成：根据描述生成完整歌曲歌词或编辑/续写现有歌词。输出可直接用于音乐生成接口。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          prompt: { type: 'string', description: '歌曲主题/风格描述' },
          mode: { type: 'string', description: '模式: write_full_song(默认)/edit' },
          lyrics: { type: 'string', description: '编辑模式下的现有歌词' },
          title: { type: 'string', description: '指定歌曲标题' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'prompt'],
      },
    },
    {
      name: 'minimax_text_to_video',
      description: 'MiniMax 文生视频：通过文字描述生成视频。支持运镜控制指令（如[推进][左摇][固定]），模型 MiniMax-Hailuo-2.3 等。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          prompt: { type: 'string', description: '视频描述（最大2000字符），支持 [左移][推进][固定] 等运镜指令' },
          model: { type: 'string', description: '模型: MiniMax-Hailuo-2.3(默认)/MiniMax-Hailuo-02/T2V-01-Director/T2V-01' },
          duration: { type: 'number', description: '时长(秒): 6(默认) 或 10' },
          resolution: { type: 'string', description: '分辨率: 720P/768P(默认)/1080P' },
          promptOptimizer: { type: 'boolean', description: '是否自动优化提示词，默认 true' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'prompt'],
      },
    },
    {
      name: 'minimax_image_to_video',
      description: 'MiniMax 图生视频：基于图片和文字描述生成视频。模型 MiniMax-Hailuo-2.3/I2V-01 等。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          firstFrameImage: { type: 'string', description: '首帧图片 URL 或 Base64 Data URL' },
          prompt: { type: 'string', description: '视频描述，支持运镜指令' },
          model: { type: 'string', description: '模型: MiniMax-Hailuo-2.3(默认)/I2V-01-Director/I2V-01-live/I2V-01 等' },
          duration: { type: 'number', description: '时长(秒): 6(默认) 或 10' },
          resolution: { type: 'string', description: '分辨率: 720P/768P(默认)/1080P' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'firstFrameImage'],
      },
    },
    {
      name: 'minimax_start_end_to_video',
      description: 'MiniMax 首尾帧生成视频：基于起始帧和结束帧图片生成过渡视频。模型 MiniMax-Hailuo-02。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          firstFrameImage: { type: 'string', description: '起始帧图片 URL 或 Base64 Data URL' },
          lastFrameImage: { type: 'string', description: '结束帧图片 URL 或 Base64 Data URL' },
          prompt: { type: 'string', description: '视频描述，支持运镜指令' },
          duration: { type: 'number', description: '时长(秒): 6(默认) 或 10' },
          resolution: { type: 'string', description: '分辨率: 768P(默认)/1080P' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'firstFrameImage', 'lastFrameImage'],
      },
    },
    {
      name: 'minimax_subject_to_video',
      description: 'MiniMax 主体参考视频：基于人物主体图片生成视频，保持人物面部一致性。模型 S2V-01。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          subjectImage: { type: 'string', description: '人物面部参考图片 URL' },
          prompt: { type: 'string', description: '视频描述' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'subjectImage'],
      },
    },
    {
      name: 'minimax_video_query',
      description: '查询 MiniMax 视频生成任务状态。状态: Preparing/Queueing/Processing/Success/Fail。成功后返回 fileId 用于下载。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          taskId: { type: 'string', description: '视频生成任务ID' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'taskId'],
      },
    },
    {
      name: 'minimax_video_download',
      description: '通过 fileId 获取 MiniMax 视频下载链接。下载链接有效期1小时。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'MiniMax API Key' },
          fileId: { type: 'string', description: '视频文件ID（从查询接口获取）' },
          baseUrl: { type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
        },
        required: ['apiKey', 'fileId'],
      },
    },
  ],

  handler: async (name, args, api) => {
    const baseUrl = getBaseUrl(args)
    const headers = getHeaders(args)

    switch (name) {
      case 'minimax_tts': {
        const voiceSetting = {
          voice_id: args.voiceId || 'Chinese (Mandarin)_Lyrical_Voice',
          speed: args.speed ?? 1,
          vol: args.vol ?? 1,
          pitch: args.pitch ?? 0,
        }
        if (args.emotion) voiceSetting.emotion = args.emotion

        const body = {
          model: args.model || 'speech-2.8-hd',
          text: args.text,
          stream: false,
          voice_setting: voiceSetting,
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: args.audioFormat || 'mp3',
            channel: 1,
          },
          output_format: args.outputFormat || 'url',
        }

        const result = await api.postJson(`${baseUrl}/v1/t2a_v2`, { headers, body, timeout: 120000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `语音合成失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: '语音合成完成',
          data: {
            audioUrl: args.outputFormat === 'url' ? result.data?.audio : undefined,
            audioHex: args.outputFormat !== 'url' ? result.data?.audio : undefined,
            audioLength: result.extra_info?.audio_length,
            audioFormat: result.extra_info?.audio_format,
          },
        }
      }

      case 'minimax_music_generation': {
        const body = {
          model: args.model || 'music-2.6',
          prompt: args.prompt,
          stream: false,
          output_format: args.outputFormat || 'url',
          ...(args.lyrics && { lyrics: args.lyrics }),
          ...(args.isInstrumental && { is_instrumental: true }),
          ...(args.lyricsOptimizer && { lyrics_optimizer: true }),
          ...(args.audioUrl && { audio_url: args.audioUrl }),
        }
        const result = await api.postJson(`${baseUrl}/v1/music_generation`, { headers, body, timeout: 600000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `音乐生成失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: '音乐生成完成',
          data: {
            audioHex: result.data?.audio,
            duration: result.extra_info?.music_duration,
            sampleRate: result.extra_info?.music_sample_rate,
          },
        }
      }

      case 'minimax_lyrics_generation': {
        const body = {
          mode: args.mode || 'write_full_song',
          prompt: args.prompt,
          ...(args.lyrics && { lyrics: args.lyrics }),
          ...(args.title && { title: args.title }),
        }
        const result = await api.postJson(`${baseUrl}/v1/lyrics_generation`, { headers, body, timeout: 120000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `歌词生成失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: '歌词生成完成',
          data: {
            songTitle: result.song_title,
            styleTags: result.style_tags,
            lyrics: result.lyrics,
          },
        }
      }

      case 'minimax_text_to_video': {
        const body = {
          model: args.model || 'MiniMax-Hailuo-2.3',
          prompt: args.prompt,
          duration: args.duration || 6,
          resolution: args.resolution || '768P',
          prompt_optimizer: args.promptOptimizer !== false,
        }
        const result = await api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `文生视频失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: `视频生成任务已创建，taskId: ${result.task_id}`,
          data: { taskId: result.task_id },
        }
      }

      case 'minimax_image_to_video': {
        const body = {
          model: args.model || 'MiniMax-Hailuo-2.3',
          first_frame_image: args.firstFrameImage,
          prompt: args.prompt || '',
          duration: args.duration || 6,
          resolution: args.resolution || '768P',
        }
        const result = await api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `图生视频失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: `图生视频任务已创建，taskId: ${result.task_id}`,
          data: { taskId: result.task_id },
        }
      }

      case 'minimax_start_end_to_video': {
        const body = {
          model: 'MiniMax-Hailuo-02',
          first_frame_image: args.firstFrameImage,
          last_frame_image: args.lastFrameImage,
          prompt: args.prompt || '',
          duration: args.duration || 6,
          resolution: args.resolution || '768P',
        }
        const result = await api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `首尾帧视频失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: `首尾帧视频任务已创建，taskId: ${result.task_id}`,
          data: { taskId: result.task_id },
        }
      }

      case 'minimax_subject_to_video': {
        const body = {
          model: 'S2V-01',
          prompt: args.prompt || '',
          subject_reference: [{ type: 'character', image: [args.subjectImage] }],
        }
        const result = await api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `主体参考视频失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: `主体参考视频任务已创建，taskId: ${result.task_id}`,
          data: { taskId: result.task_id },
        }
      }

      case 'minimax_video_query': {
        const result = await api.getJson(`${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(args.taskId)}`, { headers, timeout: 30000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `查询失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: `任务状态: ${result.status}`,
          data: {
            status: result.status,
            taskId: result.task_id,
            fileId: result.file_id,
            videoWidth: result.video_width,
            videoHeight: result.video_height,
          },
        }
      }

      case 'minimax_video_download': {
        const result = await api.getJson(`${baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(args.fileId)}`, { headers, timeout: 30000 })
        if (result.base_resp?.status_code !== 0) {
          return { success: false, message: `获取下载链接失败: ${result.base_resp?.status_msg}` }
        }
        return {
          success: true,
          message: '下载链接获取成功（有效期1小时）',
          data: {
            downloadUrl: result.file?.download_url,
            fileName: result.file?.filename,
            fileSize: result.file?.bytes,
          },
        }
      }

      default:
        return { success: false, message: `未知工具: ${name}` }
    }
  },
}
