import Long from "long";
import { Bot } from "grammy";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Driver, MetadataAuthService, TypedValues } from "ydb-sdk";
import type { Handler } from "../typings.js";

let bot = new Bot(process.env['TELEGRAM_BOT_TOKEN']!)

let s3Client = new S3Client({
	region: "ru-central1",
	endpoint: "https://storage.yandexcloud.net",
	credentials: {
		accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
		secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
	}
});

// -->> Yandex Message Queue
let handler: Handler = async function (event, context) {
	console.log(JSON.stringify(event));

	if (!event.messages) {
		return {
			statusCode: 400,
			body: "Bad Request. Handler expects messages array in the event object."
		}
	}

	let driver = new Driver({
		endpoint: 'grpcs://ydb.serverless.yandexcloud.net:2135',
		database: '/ru-central1/b1gh9qpnleo6mg7ov83v/etn3rjjh5p8gli8mupu3',
		authService: new MetadataAuthService()
	})

	await driver.ready(5_000)

	for await (const message of event.messages) {
		if (message.event_metadata.event_type !== 'yandex.cloud.events.messagequeue.QueueMessage') {
			return {
				statusCode: 400,
				body: "Bad Request. Handler expects event_type to be yandex.cloud.events.messagequeue.QueueMessage."
			}
		}

		let msg = JSON.parse(message.details.message.body) as {
			from_id: string | number,
			chat_id: string | number,
			message_id: number,
			voice_file: {
				key: string,
				bucket: string
				file_size: number
				file_duration: number
			}
		}

		let file = await s3Client.send(new GetObjectCommand({
			Key: msg.voice_file.key,
			Bucket: msg.voice_file.bucket,
		}))

		let stt = new URL('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize')
		stt.searchParams.set('lang', 'ru-RU')
		stt.searchParams.set('topic', 'general')
		stt.searchParams.set('folder_id', 'b1gunsc2gbrboetftncj')

		let response = await fetch(stt, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${context.token!.access_token}`
			},
			body: await file.Body?.transformToByteArray()
		})

		let { result } = await response.json() as { result: string }

		await bot.api.sendChatAction(msg.chat_id, 'typing')
		await bot.api.sendMessage(msg.chat_id, result, {
			reply_parameters: {
				chat_id: msg.chat_id,
				message_id: msg.message_id
			}
		})

		await driver.queryClient.do({
			fn: async (session) => {
				await session.execute({
					text: `
						DECLARE $id AS Uint64;
						DECLARE $usage AS Uint32;
						UPDATE users
						SET usage = usage + $usage
						WHERE id = $id
					`,
					parameters: {
						$id: TypedValues.uint64(Long.fromString(msg.from_id.toString())),
						$usage: TypedValues.uint32(msg.voice_file.file_duration),
					}
				})

				await session.execute({
					text: `
						DECLARE $id AS Uint64;
						DECLARE $usage AS Uint32;
						UPDATE users
						SET usage = usage + $usage
						WHERE id = $id
					`,
					parameters: {
						$id: TypedValues.uint64(Long.fromString(msg.from_id.toString())),
						$usage: TypedValues.uint32(msg.voice_file.file_duration),
					}
				})
			}
		})

		await bot.api.sendMessage(msg.chat_id, "The voice message has been processed 🎉")

		await driver.destroy()
	}

	return {
		statusCode: 200,
	}
}

module.exports.handler = handler;
