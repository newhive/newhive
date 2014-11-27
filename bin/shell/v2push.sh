#! /bin/bash

git status|grep "not staged" && exit 1

git checkout $1
git pull
git merge
git checkout $2
git merge $1
