# Docker and Dockerfiles

## What it is

Docker runs programs in **containers**: isolated processes that see their own file system, their own installed software and their own network view, while sharing the computer's kernel. A container starts from an **image**, a packaged, read-only snapshot of a file system. A **Dockerfile** is the text recipe that builds an image, one instruction per layer. On a Mac, Docker Desktop runs a small Linux virtual machine and all containers live inside it.

<!-- words -->

<details>
<summary><b>Words this note uses, in case they are new to you</b> (click to open)</summary>

- **process**: A program while it is running, with its own memory. Starting a program creates a process; when it ends the process is gone.
- **repository**: A project's folder of files together with its complete history of changes. On GitHub, a repository is a page with those files, issues and pull requests.
- **workflow**: A GitHub Actions automation described in a YAML file under `.github/workflows/`. It names the events that start it and the jobs it runs.
- **library**: A package of ready-made code that your program calls.
- **module**: A file, or a folder of files, that other code can load and use. In Terraform, a module is a folder of configuration used like a function.
- **variable**: A name for a place that holds a value which can be used later in the code.
- **list**: An ordered collection of values written one after another.
- **client**: A program that sends requests to a server.
- **folder**: A container for files and other folders on disk (also called a directory).
- **compiler**: A program that translates code written in one language into another form, and checks it on the way.

</details>

<!-- /words -->

## Why this repository uses it

`act` runs each workflow job inside a container that stands in for GitHub's `ubuntu-latest` runner. This repository builds its own small image for that, so the lab does not depend on a multi-gigabyte public image and so the exact tools are written down. Docker is needed only for `make run` (the attacks and fixes); `make check` needs no Docker.

## Where it appears

| Path | What it is |
| --- | --- |
| `ci/act-runner/Dockerfile` | The recipe for the runner image `gha-projects-act-runner:ubuntu-24.04`. |
| `.actrc` | Tells `act` to use that image as `ubuntu-latest`. |
| `Makefile` | `up` builds the image; `down` removes leftover containers made from it. |

## How it works underneath

`docker build` reads the Dockerfile from top to bottom. Each instruction makes a **layer**: a set of file changes on top of the previous one. Layers are cached by the exact text of the instruction and the layers before it, so an unchanged prefix is not rebuilt. `docker run IMAGE` creates a container from the layers plus a thin writable layer, starts one process in it, and removes the writable layer when you delete the container. A **tag** (`name:version`) is a label for an image. Tags on one machine are shared by everyone using that Docker, so a project-specific name avoids collisions.

## Walkthrough of this repository's use

```dockerfile
FROM ubuntu:24.04

ARG NODE_VERSION=22.12.0
ENV DEBIAN_FRONTEND=noninteractive
```

`FROM` picks the base image: Ubuntu 24.04, the same system as the current hosted runners. `ARG` is a build-time setting with a default (`--build-arg NODE_VERSION=...` overrides). `ENV` sets a variable in the image; `noninteractive` stops `apt` from asking questions.

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git jq make sudo unzip xz-utils build-essential shellcheck \
 && rm -rf /var/lib/apt/lists/*
```

One `RUN` is one layer. Update the package list, install what a typical job expects (`git` for checkouts, `curl`, `jq` for the result step, `make`, a compiler, `shellcheck` for actionlint), and delete the list in the same layer so it is not stored. `--no-install-recommends` skips optional extras.

```dockerfile
RUN arch="$(dpkg --print-architecture)"; \
    case "$arch" in arm64) node_arch=arm64 ;; amd64) node_arch=x64 ;; *) echo "unsupported $arch" >&2; exit 1 ;; esac; \
    curl --http1.1 --fail --silent --show-error --location --retry 5 --retry-all-errors \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -o /tmp/node.tar.xz \
 && tar -xJ -C /usr/local --strip-components=1 -f /tmp/node.tar.xz \
 && rm /tmp/node.tar.xz \
 && mkdir -p /opt/hostedtoolcache
```

Find the CPU type (Apple Silicon gives `arm64`), map it to Node's download name, download the Node tarball to a file first (with retries, so a dropped connection cannot leave a half-unpacked tree), unpack it into `/usr/local` (`--strip-components=1` removes the top folder), and delete the archive. `/opt/hostedtoolcache` is where `actions/setup-node` expects to find or put tools. The same `case` idea appears in `scripts/install-actionlint.sh`.

```dockerfile
COPY --from=python:3.12.8-slim-bookworm /usr/lib/*-linux-gnu/libsqlite3.so.0* /usr/lib/
```

This line copies a library out of another image. It is a leftover from the shared template that three sibling repositories use, where Python's `sqlite3` module needs it. **This repository's workflows do not use Python**, so the line is not needed here; it is harmless, and removing it would be a reasonable clean-up.

In `.actrc` (see `act.md`): `-P ubuntu-latest=gha-projects-act-runner:ubuntu-24.04` maps the label `ubuntu-latest` to this image, and `--pull=false` stops `act` from trying to download it from a registry, since it exists only on your machine. The image name carries the project prefix because image names are shared by every project on the computer.

`make up` runs `docker build -q -t $(ACT_IMAGE) ci/act-runner`: `-t` names the image, `-q` is quiet, `ci/act-runner` is the build context (the folder holding the Dockerfile).

## Try it yourself

1. `docker --version` prints the client version.
2. `docker build -q -t gha-projects-act-runner:ubuntu-24.04 ci/act-runner` (what `make up` runs, plus `npm ci`) builds the image; it needs network, some minutes and disk space. Not run for these notes.
3. `docker image ls gha-projects-act-runner` shows the image and its size.
4. `docker run --rm gha-projects-act-runner:ubuntu-24.04 node --version` prints `v22.12.0`.
5. `docker run --rm gha-projects-act-runner:ubuntu-24.04 jq --version` shows the `jq` the result step uses.

## Mistakes people make

- Installing packages in one `RUN` and cleaning up in another; the first layer keeps the junk.
- Using `latest` tags, so a rebuild changes silently. This Dockerfile pins the base and the Node version.
- Sharing one image name across projects and finding someone else's build under it.
- Forgetting that a container's changes vanish when it is removed.
- Letting the image fill the disk; remove old images and containers (`make down`, `docker system df`).

## Check yourself

1. Image versus container? *(An image is a read-only snapshot; a container is a running instance of one.)*
2. Why does the `apt-get` `RUN` end with `rm -rf /var/lib/apt/lists/*`? *(So the package lists are not stored in the layer.)*
3. Why does `.actrc` say `--pull=false`? *(The image only exists locally; there is nothing to download.)*
4. What does `COPY --from` copy from? *(Another image.)*
5. Why does `make down` filter by `ancestor`? *(To remove only containers made from this project's image.)*

## Further reading

- Dockerfile reference: https://docs.docker.com/reference/dockerfile/
- Docker CLI reference: https://docs.docker.com/reference/cli/docker/
