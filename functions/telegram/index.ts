import { Bot, webhookCallback } from "grammy";
import { Driver, MetadataAuthService, TypedValues } from 'ydb-sdk';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Handler, IResponse } from "../typings.js";

const DEFAULT_USER_QUOTA = 1 * 60 * 60 // 1 hour

let bot = new Bot(process.env['TELEGRAM_BOT_TOKEN']!)

let mqClient = new SQSClient({
	region: "ru-central1",
	endpoint: "https://message-queue.api.cloud.yandex.net",
	credentials: {
		accessKeyId: process.env['AWS_ACCESS_KEY_ID']!,
		secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY']!,
	}
});

bot.on('message:voice', async (ctx) => {
	let size = ctx.msg.voice.file_size; // in byters
	let duration = ctx.msg.voice.duration; // in seconds

	if (duration > 30) {
		await ctx.reply("The voice message is too long. The maximum duration is 30 seconds.");
		return;
	}

	if (size === undefined) {
		await ctx.reply("The voice message size is unknown. I can't process it.");
		return;
	}

	if (size > 1 * 1024 * 1024) {
		await ctx.reply("The voice message is too large. The maximum size is 1 MB.");
		return;
	}

	let driver = new Driver({
		endpoint: 'grpcs://ydb.serverless.yandexcloud.net:2135',
		database: '/ru-central1/b1gh9qpnleo6mg7ov83v/etn3rjjh5p8gli8mupu3',
		authService: new MetadataAuthService()
	})

	await driver.ready(5_000)

	// crate users table if not exists
	await driver.queryClient.do({
		fn: async (session) => {
			await session.execute({
				text: `
					CREATE TABLE IF NOT EXISTS users (
						id Uint64,
						quota Uint32,
						usage Uint32,
						PRIMARY KEY (id)
					)
				`,
			})
		}
	})

	// get user
	let user = await driver.queryClient.doTx({
		fn: async (session) => {
			let result = await session.execute({
				text: `
					DECLARE $id AS Uint64;
					SELECT id, quota, usage FROM users WHERE id = $id
				`,
				parameters: {
					$id: TypedValues.uint64(ctx.from.id)
				},
			})

			for await (const resultSet of result.resultSets) {
				for await (const row of resultSet.rows) {
					return row
				}
			}

			return null
		}
	})

	// create user
	if (!user) {
		user = { id: ctx.from.id, usage: 0, quota: DEFAULT_USER_QUOTA };

		await driver.queryClient.doTx({
			fn: async (session) => {
				await session.execute({
					text: `
						DECLARE $id AS Uint64;
						DECLARE $quota AS Uint32;
						DECLARE $usage AS Uint32;
						INSERT INTO users (id, quota, usage) VALUES ($id, $quota, $usage);
					`,
					parameters: {
						$id: TypedValues.uint64(user!.id),
						$quota: TypedValues.uint32(user!.quota),
						$usage: TypedValues.uint32(user!.usage),
					}
				})
			}
		})
	}

	if (user.usage + duration > user.quota) {
		await ctx.reply("You have reached the limit of voice recognition. Try again later.");
		return;
	}

	let file = await ctx.getFile();
	await mqClient.send(new SendMessageCommand({
		MessageBody: JSON.stringify({
			from_id: ctx.from.id,
			chat_id: ctx.chat.id,
			message_id: ctx.msg.message_id,
			file_id: file.file_id,
			file_path: file.file_path,
			file_size: file.file_size,
			file_duration: ctx.msg.voice.duration,
		}),
		QueueUrl: process.env['DOWNLOAD_QUEUE']
	}))

	await ctx.reply("The voice message is sent for recognition.");

	await driver.destroy()
})

// -->> Telegram
let handler: Handler = async function (event, context) {
	let handle = webhookCallback(bot, 'aws-lambda-async')

	return handle(event, context) as unknown as IResponse
};

module.exports.handler = handler;
