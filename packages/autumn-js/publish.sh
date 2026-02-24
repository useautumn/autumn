#!/bin/bash


npm run build

if [ "$1" = "--tag" ] && [ "$2" = "beta" ]; then
  npm publish --tag beta
elif [ "$1" = "--major" ] && [ "$2" = "beta" ]; then
  npm version premajor --preid=beta
  npm publish --tag beta
elif [ "$1" = "--minor" ] && [ "$2" = "beta" ]; then
  npm version preminor --preid=beta
  npm publish --tag beta
elif [ "$1" = "--major" ]; then
  npm version major
  npm publish
elif [ "$1" = "--minor" ]; then
  npm version minor
  npm publish
else
  npm version patch
  npm publish
fi