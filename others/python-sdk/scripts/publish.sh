#!/usr/bin/env bash

uv build
uv publish --token $PYPI_TOKEN
