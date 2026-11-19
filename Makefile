-include .env
export

UID ?= $(shell id -u)
GID ?= $(shell id -g)
GIT_TAG ?= $$(git describe --abbrev=0 --tags)

APPLICATION_NAME ?= fhir-converter-liquid
IMAGE_NAME = ${APPLICATION_NAME}

help:
	@echo "\e[32m Usage make [target] "
	@echo
	@echo "\e[1m targets:"
	@egrep '^(.+)\:\ ##\ (.+)' ${MAKEFILE_LIST} | column -t -c 2 -s ':#'

clean: ## Clean everything
	docker-compose -p ${APPLICATION_NAME} rm -sfv
.PHONY: clean

pull-images: ## Pull all images
	docker-compose -p ${APPLICATION_NAME} pull --include-deps
.PHONY: pull-images

watch-logs: ## Open a tail on all the logs
	docker-compose -p ${APPLICATION_NAME} logs -f -t
.PHONY: watch-logs

build: ## Build the container
	docker build --target runner -t ${IMAGE_NAME} . --build-arg GIT_TAG=${GIT_TAG}
	docker build --target dev -t ${IMAGE_NAME}_dev . --build-arg GIT_TAG=${GIT_TAG}
.PHONY: build

start: ## Start the transformation
	# Start all containers
	docker-compose -p ${APPLICATION_NAME} up -d --remove-orphans fhir_converter
.PHONY: start

test: ## Run unit tests
	docker build --target tester . --build-arg GIT_TAG=${GIT_TAG}
.PHONY: test

integration-test: ## Placeholder
	@echo "Skipping integration tests as requested."
	@exit 0
.PHONY: .integration-test

stop: ## Stop running containers
	docker-compose -p ${APPLICATION_NAME} stop
.PHONY: stop

lint-dockerfile: ## Lint the docker file
	docker run --rm -i hadolint/hadolint < Dockerfile
.PHONY: lint-dockerfile

sync-templates: ## Sync HL7v2 templates from the pinned Microsoft FHIR Converter revision
	node scripts/sync-upstream-assets.js templates
.PHONY: sync-templates

sync-ccda-templates: ## Sync C-CDA templates from the pinned Microsoft FHIR Converter revision
	node scripts/sync-upstream-assets.js ccda-templates
.PHONY: sync-ccda-templates

sync-expected-results: ## Sync official HL7v2 expected JSON results from the pinned revision
	node scripts/sync-upstream-assets.js expected-results
.PHONY: sync-expected-results

sync-hl7v2-samples: ## Sync HL7v2 UI sample messages from the pinned Microsoft revision
	node scripts/sync-upstream-assets.js hl7v2-samples
.PHONY: sync-hl7v2-samples

restart: ## Restart the app
restart: stop start
.PHONY: restart

.DEFAULT_GOAL := help
