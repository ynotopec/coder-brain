.PHONY: install run run-cli run-cli-offline test lint check clean

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

lint:
	npm run lint

check:
	npm run check

clean:
	npm run clean
