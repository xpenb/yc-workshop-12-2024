import { Bot } from "grammy";
import { S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Upload } from "@aws-sdk/lib-storage";
import type { Handler } from "../typings";

let bot = new Bot(process.env['TELEGRAM_BOT_TOKEN']!)

let s3Client = new S3Client({
	region: "ru-central1",
	endpoint: "https://storage.yandexcloud.net",
	credentials: {
		accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
		secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
	}
});

let mqClient = new SQSClient({
	region: "ru-central1",
	endpoint: "https://message-queue.api.cloud.yandex.net",
	credentials: {
		accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
		secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
	}
});

// -->> Mesasge Queue
let handler: Handler = async function (event, context) {
	if (!event.messages) {
		return {
			statusCode: 400,
			body: "Bad Request. Handler expects messages array in the event object."
		}
	}

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
			file_id: string,
			file_path: string,
			file_size: number,
			file_duration: number,
		}

		let file = await bot.api.getFile(msg.file_id)
		let voiceFile = await (await fetch(`https://api.telegram.org/file/bot${process.env['TELEGRAM_BOT_TOKEN']}/${file.file_path}`)).arrayBuffer()

		let upload = new Upload({
			client: s3Client,
			params: {
				Key: `voice/${file.file_id}.ogg`,
				Body: new Uint8Array(voiceFile),
				Bucket: 'yc-workshop',
			}
		})

		let output = await upload.done()

		await mqClient.send(new SendMessageCommand({
			MessageBody: JSON.stringify({
				from_id: msg.from_id,
				chat_id: msg.chat_id,
				message_id: msg.message_id,
				voice_file: {
					key: output.Key,
					bucket: output.Bucket,
					file_size: msg.file_size,
					file_duration: msg.file_duration
				}
			}),
			QueueUrl: process.env['RECOGNITION_QUEUE']
		}))

		await bot.api.sendChatAction(msg.chat_id, 'typing')
		await bot.api.sendMessage(msg.chat_id, "The voice message is being processed. Please wait.")
	}

	return {
		statusCode: 200
	}
};

module.exports.handler = handler;
