import { Elysia } from 'elysia'
import { join } from 'node:path'
import { createFeishu } from './channels/feishu.ts'
import { buildAgent, handlerMessage } from './bot/bot.ts'

const app = new Elysia()
  .onStart(async () => {
    await buildAgent()
    const { FEISHU_APP_ID, FEISHU_APP_SECRET } = process.env
    if (FEISHU_APP_ID && FEISHU_APP_SECRET) {
      await createFeishu(
        {
          appId: FEISHU_APP_ID,
          appSecret: FEISHU_APP_SECRET,
        },
        async (data, reply) => {
          handlerMessage(
            'feishu',
            data.message.chat_id,
            data.message.content,
            data.sender.sender_id?.union_id || '',
            reply,
          )
        },
      )
    } else {
      console.log('[error] 飞书应用配置错误，缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET')
    }

    console.log('manbot 启动成功')
  })
  .listen(process.env.PORT || 45927)
