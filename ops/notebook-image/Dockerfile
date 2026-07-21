FROM python:3.12-slim-bookworm

ARG JUPYTERLAB_VERSION=4.6.1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN groupadd --gid 1000 notebook \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin notebook \
    && python -m pip install "jupyterlab==${JUPYTERLAB_VERSION}" \
    && install -d -o notebook -g notebook -m 0700 /home/notebook/work

USER 1000:1000
WORKDIR /home/notebook/work
EXPOSE 8888

