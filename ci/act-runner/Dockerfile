# The image `act` uses as `ubuntu-latest`: Ubuntu 24.04 (so actions/setup-python finds its prebuilt interpreters),
# Node for JavaScript actions, git, curl, jq, shellcheck and a compiler. It is a stand-in for a GitHub-hosted runner,
# not a copy of one.
FROM node:22.12.0-bookworm-slim AS node

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git jq make sudo unzip xz-utils build-essential shellcheck \
 && rm -rf /var/lib/apt/lists/*

# Node and npm from the official image, so the build needs no download from nodejs.org.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && mkdir -p /opt/hostedtoolcache
