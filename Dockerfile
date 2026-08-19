#########################################
### Prod Image                         ##
#########################################
FROM node:18-alpine AS runner
ARG GIT_TAG
COPY . /app
WORKDIR /app
RUN if [ -n "${GIT_TAG}" ]; then sed -i "/\"version\": \"0.0.0\"/c\  \"version\": \"${GIT_TAG}\"," package.json ; fi
RUN npm install --no-fund --omit=dev --no-audit

EXPOSE 2019
ENTRYPOINT [ "npm", "start" ]

#########################################
### Dev Image                          ##
#########################################
FROM node:18-alpine AS dev
ARG GIT_TAG
COPY . /app
WORKDIR /app
RUN if [ -n "${GIT_TAG}" ]; then sed -i "/\"version\": \0.0.0\"/c\  \"version\": \"${GIT_TAG}\"," package.json ; fi
RUN npm install

#########################################
### Test stage                         ##
#########################################
FROM dev AS tester
RUN npm run pretest && npm test
