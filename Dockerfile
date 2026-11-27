#########################################
### Production Dependencies            ##
#########################################
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit

#########################################
### Prod Image (Lean Internal Runtime) ##
#########################################
FROM node:26-alpine AS runner
ARG GIT_TAG
WORKDIR /app
ENV NODE_ENV=production \
    STATELESS_RUNTIME=true

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY config/ ./config/
COPY src/ ./src/
COPY customers/ ./customers/

RUN if [ -n "${GIT_TAG}" ]; then sed -i "/\"version\": \"0.0.0\"/c\  \"version\": \"${GIT_TAG}\"," package.json ; fi \
 && node src/init-service.js \
 && chown -R node:node /app

USER node
EXPOSE 2019
ENTRYPOINT ["node", "src/runtime.js"]

#########################################
### Studio Image (Full Web UI)         ##
#########################################
FROM runner AS studio
ENTRYPOINT ["node", "src/index.js"]

#########################################
### Dev Image                          ##
#########################################
FROM node:26-alpine AS dev
ARG GIT_TAG
COPY . /app
WORKDIR /app
RUN if [ -n "${GIT_TAG}" ]; then sed -i "/\"version\": \"0.0.0\"/c\  \"version\": \"${GIT_TAG}\"," package.json ; fi
RUN npm install

#########################################
### Test stage                         ##
#########################################
FROM dev AS tester
RUN npm run pretest && npm test
