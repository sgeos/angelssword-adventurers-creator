# Two stages. The build stage needs the development dependencies to compile
# the browser half; the runtime stage carries neither them nor the compiler.
#
# Node 22.18 is the floor, because the server is TypeScript and runs through
# native type stripping with no build step. Upstream pull request 1 used
# node:20, which cannot load this server at all.
FROM node:22.18-alpine AS build

WORKDIR /app

# Dependency manifests first, so a source change does not invalidate the
# install layer.
COPY package.json package-lock.json ./
RUN npm ci

# Only what the browser build reads.
COPY tsconfig.json tsconfig.browser.json tsconfig.worker.json ./
COPY src/ ./src/

RUN npx tsc -p tsconfig.browser.json && npx tsc -p tsconfig.worker.json


FROM node:22.18-alpine AS runtime

WORKDIR /app

# Runtime dependencies only. Nothing here needs the compiler, the linter, the
# test frameworks or the bundler.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server runs from source; Node strips the types as it loads.
COPY server.mts ./
COPY public/ ./public/

# The compiled browser modules, built in the stage above.
COPY --from=build /app/public/js/ ./public/js/

# Run unprivileged. The base image provides this account.
USER node

# A container has no browser to open, and no xdg-open to attempt it with.
ENV AS_NO_OPEN=1
ENV PORT=3001
EXPOSE 3001

# Keys may be supplied here so that one deployment serves several people
# without each holding their own. A key sent from a browser takes precedence.
#   OPENAI_API_KEY   sprite generation through OpenAI
#   GOOGLE_API_KEY   video generation through Gemini
#   XAI_API_KEY      sprite and video generation through Grok
#   COMFYUI_URL      a ComfyUI instance, which must be on the local network

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mts"]
