# Two stages. The build stage needs the development dependencies to build the
# browser half; the runtime stage carries neither them nor the bundler.
#
# Node 22.18 is the floor, because the server is TypeScript and runs through
# native type stripping with no build step. Upstream pull request 1 used
# node:20, which cannot load this server at all.
#
# The image is not the floor, though. Continuous integration tests the floor
# with setup-node. What ships here should carry the security releases made
# since, five of them between 22.18.0 and 22.23.4, so the image tracks the
# newest 22 minor. The container job runs this image, which is what checks it.
FROM node:22.23-alpine AS build

WORKDIR /app

# Dependency manifests first, so a source change does not invalidate the
# install layer.
COPY package.json package-lock.json ./
RUN npm ci

# Only what the browser build reads: Vite's configuration, the sources, and
# the static files it copies into its output.
COPY vite.config.mts ./
COPY src/ ./src/
COPY public/ ./public/

# TanStack Start on Vite. Writes the page and its assets to dist/client.
RUN npx vite build


FROM node:22.23-alpine AS runtime

WORKDIR /app

# Runtime dependencies only. Nothing here needs the compiler, the linter, the
# test frameworks or the bundler.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server runs from source; Node strips the types as it loads.
COPY server.mts ./

# The server imports from the portable core, so the core has to be present at
# runtime even though nothing here is compiled. The whole layer is copied
# rather than the single module the server currently reaches, because the
# narrow version of this line is what broke: the server gained a core import
# during the layering work, the image still built, and the container then
# exited on a missing module at startup. Core has no dependencies of its own,
# so copying all of it costs a few hundred kilobytes and removes the trap.
COPY src/core/ ./src/core/

# The page and everything it loads, built in the stage above. The server serves
# this directory, and test/integration/api/deployment.test.mts checks that the
# two agree, since a page the image lacks is the same failure as a module it
# lacks, found the same way: only by running the container.
COPY --from=build /app/dist/client/ ./dist/client/

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
