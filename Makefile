.PHONY: install run run-cli run-cli-offline test

install:
	npm ci

run:
	npm start

run-cli:
	npm run run

run-cli-offline:
	OPENAI_OFFLINE=true npm run run

test:
	npm test
