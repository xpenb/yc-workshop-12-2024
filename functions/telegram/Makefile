export PATH := $(HOME)/yandex-cloud/bin/yc:$(PATH)

.PHONY: deploy

deploy:
	yc serverless function version create \
		--function-name=ws-telegram \
		--runtime nodejs18 \
		--entrypoint index.handler \
		--memory 128m \
		--execution-timeout 5s \
		--source-path index.js \
		--service-account-id ajes58j7kjo5mnv63j48 \
		--environment DOWNLOAD_QUEUE=b1gh9qpnleo6mg7ov83v/dj600000002l9drg07vf/ws-download \
		--secret id=e6qfurfge6fmevhl3o28,version-id=e6qckqvp0m7l8pqfh8ji,key=token,environment-variable=TELEGRAM_BOT_TOKEN \
		--secret id=e6qfurfge6fmevhl3o28,version-id=e6qckqvp0m7l8pqfh8ji,key=access_key,environment-variable=AWS_ACCESS_KEY_ID \
		--secret id=e6qfurfge6fmevhl3o28,version-id=e6qckqvp0m7l8pqfh8ji,key=secret_key,environment-variable=AWS_SECRET_ACCESS_KEY
